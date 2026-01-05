const ffmpeg = require('..')
const fs = require('bare-fs')

// This example demonstrates HLS-compatible streaming output
// It transcodes video to MPEG-TS segments that can be served as HLS
//
// For true HLS, you'd need to:
// 1. Split TS output at keyframe boundaries into segments
// 2. Generate and update m3u8 playlist dynamically
// 3. Serve segments via HTTP as they're ready

console.log('HLS-Compatible Streaming Output Example')
console.log('========================================')

// Load a sample video
const video = require('../test/fixtures/video/sample.mp4', {
  with: { type: 'binary' }
})

// Create input context
const io = new ffmpeg.IOContext(video)
using inputFormat = new ffmpeg.InputFormatContext(io)

// Find video stream
const inputStream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
console.log('Input stream:', {
  codec: ffmpeg.Codec.for(inputStream.codecParameters.id).name,
  width: inputStream.codecParameters.width,
  height: inputStream.codecParameters.height
})

// === HLS Segment Manager ===
// In a real implementation, these would be served via HTTP
const segments = []
let currentSegment = []
let currentSegmentDuration = 0
let currentSegmentIndex = 0
const TARGET_SEGMENT_DURATION = 2.0 // 2 second segments

function startNewSegment() {
  if (currentSegment.length > 0) {
    const segmentData = Buffer.concat(currentSegment)
    segments.push({
      index: currentSegmentIndex,
      duration: currentSegmentDuration,
      data: segmentData
    })
    console.log(`  Segment ${currentSegmentIndex}: ${currentSegmentDuration.toFixed(2)}s, ${segmentData.length} bytes`)
    currentSegmentIndex++
  }
  currentSegment = []
  currentSegmentDuration = 0
}

function generatePlaylist() {
  let playlist = '#EXTM3U\n'
  playlist += '#EXT-X-VERSION:3\n'
  playlist += `#EXT-X-TARGETDURATION:${Math.ceil(TARGET_SEGMENT_DURATION)}\n`
  playlist += '#EXT-X-MEDIA-SEQUENCE:0\n'

  for (const seg of segments) {
    playlist += `#EXTINF:${seg.duration.toFixed(3)},\n`
    playlist += `segment${seg.index}.ts\n`
  }

  playlist += '#EXT-X-ENDLIST\n'
  return playlist
}

// === Output Setup ===
// Use MPEG-TS container (HLS-compatible)
const outputIO = new ffmpeg.IOContext(Buffer.alloc(65536), {
  onwrite: (chunk) => {
    currentSegment.push(chunk)
  }
})

const outputFormat = new ffmpeg.OutputFormatContext('mpegts', outputIO)

// Create output stream
const outputStream = outputFormat.createStream()
outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.VIDEO
outputStream.codecParameters.id = ffmpeg.constants.codecs.H264
outputStream.codecParameters.width = inputStream.codecParameters.width
outputStream.codecParameters.height = inputStream.codecParameters.height
outputStream.timeBase = new ffmpeg.Rational(1, 90000) // Standard TS timebase

// Create decoder and encoder
const decoder = inputStream.decoder()
decoder.open()

const encoder = outputStream.encoder()
encoder.width = inputStream.codecParameters.width
encoder.height = inputStream.codecParameters.height
encoder.pixelFormat = ffmpeg.constants.pixelFormats.YUV420P
encoder.timeBase = new ffmpeg.Rational(1, 30)
encoder.frameRate = new ffmpeg.Rational(30, 1)
encoder.gopSize = 30 // Keyframe every second at 30fps (important for segmentation!)
encoder.flags |= ffmpeg.constants.codecFlags.GLOBAL_HEADER

// Set bitrate for compatibility
encoder.setOption('b', '1500000') // 1.5 Mbps

encoder.open()
console.log('Encoder opened')

// Copy extradata
outputStream.codecParameters.extraData = encoder.extraData

outputFormat.writeHeader()

// === Transcode Loop ===
using inputPacket = new ffmpeg.Packet()
using frame = new ffmpeg.Frame()
using outputPacket = new ffmpeg.Packet()

let framesProcessed = 0
let lastKeyframePts = 0

console.log('\nTranscoding to HLS-compatible segments...')

while (inputFormat.readFrame(inputPacket)) {
  if (inputPacket.streamIndex !== inputStream.index) continue

  decoder.sendPacket(inputPacket)
  inputPacket.unref()

  while (decoder.receiveFrame(frame)) {
    framesProcessed++

    // Set proper timestamps
    frame.pts = framesProcessed
    frame.timeBase = encoder.timeBase

    encoder.sendFrame(frame)

    while (encoder.receivePacket(outputPacket)) {
      // Check for keyframe - this is where we can start a new segment
      const isKeyframe = (outputPacket.flags & 0x0001) !== 0 // AV_PKT_FLAG_KEY

      // Calculate duration since last keyframe
      const pts = Number(outputPacket.pts)
      const timeBase = encoder.timeBase
      const currentTime = pts * timeBase.numerator / timeBase.denominator

      if (isKeyframe && currentSegmentDuration >= TARGET_SEGMENT_DURATION) {
        // Start new segment at keyframe boundary
        startNewSegment()
      }

      // Update segment duration
      const frameDuration = 1.0 / 30 // Assume 30fps
      currentSegmentDuration += frameDuration

      // Rescale and write
      outputPacket.streamIndex = outputStream.index
      outputPacket.pts = ffmpeg.Rational.rescaleQ(outputPacket.pts, encoder.timeBase, outputStream.timeBase)
      outputPacket.dts = ffmpeg.Rational.rescaleQ(outputPacket.dts, encoder.timeBase, outputStream.timeBase)

      outputFormat.writeFrame(outputPacket)
      outputPacket.unref()
    }

    frame.unref()
  }
}

// Flush
decoder.sendPacket(null)
while (decoder.receiveFrame(frame)) {
  frame.pts = ++framesProcessed
  frame.timeBase = encoder.timeBase
  encoder.sendFrame(frame)
  while (encoder.receivePacket(outputPacket)) {
    currentSegmentDuration += 1.0 / 30
    outputPacket.streamIndex = outputStream.index
    outputPacket.pts = ffmpeg.Rational.rescaleQ(outputPacket.pts, encoder.timeBase, outputStream.timeBase)
    outputPacket.dts = ffmpeg.Rational.rescaleQ(outputPacket.dts, encoder.timeBase, outputStream.timeBase)
    outputFormat.writeFrame(outputPacket)
    outputPacket.unref()
  }
  frame.unref()
}

encoder.sendFrame(null)
while (encoder.receivePacket(outputPacket)) {
  currentSegmentDuration += 1.0 / 30
  outputPacket.streamIndex = outputStream.index
  outputPacket.pts = ffmpeg.Rational.rescaleQ(outputPacket.pts, encoder.timeBase, outputStream.timeBase)
  outputPacket.dts = ffmpeg.Rational.rescaleQ(outputPacket.dts, encoder.timeBase, outputStream.timeBase)
  outputFormat.writeFrame(outputPacket)
  outputPacket.unref()
}

// Finalize last segment
startNewSegment()

outputFormat.writeTrailer()

// Cleanup
decoder.destroy()
encoder.destroy()

// === Results ===
console.log('\n=== HLS Output ===')
console.log(`Total segments: ${segments.length}`)
console.log(`Total frames: ${framesProcessed}`)

// Generate and show playlist
const playlist = generatePlaylist()
console.log('\nGenerated m3u8 playlist:')
console.log('------------------------')
console.log(playlist)

// Save segments to disk for testing
const outputDir = 'hls_output'
try {
  fs.mkdirSync(outputDir)
} catch (e) {
  // Directory exists
}

fs.writeFileSync(`${outputDir}/playlist.m3u8`, playlist)
for (const seg of segments) {
  fs.writeFileSync(`${outputDir}/segment${seg.index}.ts`, seg.data)
}

console.log(`\nHLS files saved to ${outputDir}/`)
console.log('You can serve these with any HTTP server and play with HLS-compatible players')
console.log('\nExample: python -m http.server 8000')
console.log('Then open: http://localhost:8000/hls_output/playlist.m3u8')
