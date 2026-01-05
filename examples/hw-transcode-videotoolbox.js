const ffmpeg = require('..')
const os = require('bare-os')
const process = require('bare-process')
const fs = require('bare-fs')

if (os.platform() !== 'darwin' && os.platform() !== 'ios') {
  console.log('This example only works on macOS/iOS with VideoToolbox')
  process.exit(1)
}

// This example demonstrates hardware-accelerated transcoding on macOS/iOS using VideoToolbox
// It decodes HEVC/H264 video using hardware acceleration and re-encodes to H264 using VideoToolbox encoder

console.log('VideoToolbox Hardware Transcode Example')
console.log('=======================================')

// Load a sample video
const video = require('../test/fixtures/video/sample.mp4', {
  with: { type: 'binary' }
})

// Create input context
const io = new ffmpeg.IOContext(video)
using inputFormat = new ffmpeg.InputFormatContext(io)

// Find video stream
const inputStream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
const inputCodec = ffmpeg.Codec.for(inputStream.codecParameters.id)
console.log('Input stream:', {
  codec: inputCodec.name,
  width: inputStream.codecParameters.width,
  height: inputStream.codecParameters.height
})

// Create hardware device context for VideoToolbox
console.log('\nCreating VideoToolbox hardware device context...')
using hwDevice = new ffmpeg.HWDeviceContext(ffmpeg.constants.hwDeviceTypes.VIDEOTOOLBOX)

// === DECODER SETUP ===
const decoder = inputStream.decoder()
decoder.hwDeviceCtx = hwDevice

// Set getFormat callback to select hardware pixel format
decoder.getFormat = (ctx, formats) => {
  const hwFormat = formats.find((f) => f === ffmpeg.constants.pixelFormats.VIDEOTOOLBOX)
  if (hwFormat) {
    console.log('Decoder: Selected VideoToolbox hardware format')
    return hwFormat
  }
  console.log('Decoder: Hardware format not available, using:', formats[0])
  return formats[0]
}

decoder.open()
console.log('Decoder opened with VideoToolbox acceleration')

// === ENCODER SETUP ===
// Create output in memory
const outputChunks = []
const outputIO = new ffmpeg.IOContext(Buffer.alloc(4096), {
  onwrite: (chunk) => outputChunks.push(chunk)
})
const outputFormat = new ffmpeg.OutputFormatContext('mp4', outputIO)

// Create output stream
const outputStream = outputFormat.createStream()
outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.VIDEO
outputStream.codecParameters.id = ffmpeg.constants.codecs.H264
outputStream.codecParameters.width = inputStream.codecParameters.width
outputStream.codecParameters.height = inputStream.codecParameters.height
outputStream.timeBase = inputStream.timeBase

// Create encoder using h264_videotoolbox (hardware encoder)
let encoder
try {
  // Try to find the VideoToolbox hardware encoder
  encoder = ffmpeg.createEncoderContext('h264_videotoolbox')
  console.log('Encoder: Using h264_videotoolbox hardware encoder')
} catch (e) {
  console.log('h264_videotoolbox not available, falling back to software encoder')
  encoder = outputStream.encoder()
}

// Configure encoder
encoder.width = inputStream.codecParameters.width
encoder.height = inputStream.codecParameters.height
encoder.pixelFormat = ffmpeg.constants.pixelFormats.NV12 // VideoToolbox prefers NV12
encoder.timeBase = new ffmpeg.Rational(1, 30) // 30 fps
encoder.frameRate = new ffmpeg.Rational(30, 1)
encoder.gopSize = 30 // Keyframe every 30 frames
encoder.flags |= ffmpeg.constants.codecFlags.GLOBAL_HEADER

// Set bitrate (required for VideoToolbox, can't use CQ mode)
encoder.setOption('b', '2000000') // 2 Mbps

encoder.open()
console.log('Encoder opened')

// Copy extradata to stream parameters
outputStream.codecParameters.extraData = encoder.extraData

outputFormat.writeHeader()

// === TRANSCODE LOOP ===
using inputPacket = new ffmpeg.Packet()
using hwFrame = new ffmpeg.Frame()
using swFrame = new ffmpeg.Frame()
using outputPacket = new ffmpeg.Packet()

// Pre-allocate software frame for format conversion
swFrame.format = ffmpeg.constants.pixelFormats.NV12
swFrame.width = inputStream.codecParameters.width
swFrame.height = inputStream.codecParameters.height
swFrame.alloc()

let framesDecoded = 0
let framesEncoded = 0

console.log('\nTranscoding...')

while (inputFormat.readFrame(inputPacket)) {
  if (inputPacket.streamIndex !== inputStream.index) continue

  // Decode
  decoder.sendPacket(inputPacket)
  inputPacket.unref()

  while (decoder.receiveFrame(hwFrame)) {
    framesDecoded++

    // Transfer from hardware to software memory
    // VideoToolbox frames need to be transferred to NV12 for the encoder
    if (hwFrame.format === ffmpeg.constants.pixelFormats.VIDEOTOOLBOX) {
      hwFrame.transferData(swFrame)
    } else {
      // Already in software format
      swFrame.copyProperties(hwFrame)
    }

    // Preserve PTS
    swFrame.pts = hwFrame.pts
    swFrame.timeBase = hwFrame.timeBase || inputStream.timeBase

    // Encode
    encoder.sendFrame(swFrame)

    while (encoder.receivePacket(outputPacket)) {
      framesEncoded++
      outputPacket.streamIndex = outputStream.index

      // Rescale timestamps
      outputPacket.pts = ffmpeg.Rational.rescaleQ(
        outputPacket.pts,
        encoder.timeBase,
        outputStream.timeBase
      )
      outputPacket.dts = ffmpeg.Rational.rescaleQ(
        outputPacket.dts,
        encoder.timeBase,
        outputStream.timeBase
      )

      outputFormat.writeFrame(outputPacket)
      outputPacket.unref()
    }

    hwFrame.unref()
  }
}

// Flush decoder
decoder.sendPacket(null)
while (decoder.receiveFrame(hwFrame)) {
  framesDecoded++

  if (hwFrame.format === ffmpeg.constants.pixelFormats.VIDEOTOOLBOX) {
    hwFrame.transferData(swFrame)
  }

  swFrame.pts = hwFrame.pts
  swFrame.timeBase = hwFrame.timeBase || inputStream.timeBase

  encoder.sendFrame(swFrame)
  while (encoder.receivePacket(outputPacket)) {
    framesEncoded++
    outputPacket.streamIndex = outputStream.index
    outputPacket.pts = ffmpeg.Rational.rescaleQ(outputPacket.pts, encoder.timeBase, outputStream.timeBase)
    outputPacket.dts = ffmpeg.Rational.rescaleQ(outputPacket.dts, encoder.timeBase, outputStream.timeBase)
    outputFormat.writeFrame(outputPacket)
    outputPacket.unref()
  }
  hwFrame.unref()
}

// Flush encoder
encoder.sendFrame(null)
while (encoder.receivePacket(outputPacket)) {
  framesEncoded++
  outputPacket.streamIndex = outputStream.index
  outputPacket.pts = ffmpeg.Rational.rescaleQ(outputPacket.pts, encoder.timeBase, outputStream.timeBase)
  outputPacket.dts = ffmpeg.Rational.rescaleQ(outputPacket.dts, encoder.timeBase, outputStream.timeBase)
  outputFormat.writeFrame(outputPacket)
  outputPacket.unref()
}

outputFormat.writeTrailer()

// Cleanup
decoder.destroy()
encoder.destroy()

// Results
const outputData = Buffer.concat(outputChunks)
console.log('\n=== Results ===')
console.log(`Frames decoded: ${framesDecoded}`)
console.log(`Frames encoded: ${framesEncoded}`)
console.log(`Output size: ${outputData.length} bytes`)

// Write output file
const outputFile = 'transcode_output.mp4'
fs.writeFileSync(outputFile, outputData)
console.log(`Output saved to: ${outputFile}`)
console.log('\nVideoToolbox hardware transcode complete!')
