const binding = require('./binding')
const AudioFIFO = require('./lib/audio-fifo')
const BitstreamFilter = require('./lib/bitstream-filter')
const ChannelLayout = require('./lib/channel-layout')
const Codec = require('./lib/codec')
const CodecContext = require('./lib/codec-context')
const CodecParameters = require('./lib/codec-parameters')
const Decoder = require('./lib/decoder')
const Dictionary = require('./lib/dictionary')
const Encoder = require('./lib/encoder')
const { InputFormatContext, OutputFormatContext } = require('./lib/format-context')
const Filter = require('./lib/filter')
const FilterContext = require('./lib/filter-context')
const FilterGraph = require('./lib/filter-graph')
const FilterInOut = require('./lib/filter-inout')
const Frame = require('./lib/frame')
const HWDeviceContext = require('./lib/hw-device-context')
const HWFramesContext = require('./lib/hw-frames-context')
const HWFramesConstraints = require('./lib/hw-frames-constraints')
const IOContext = require('./lib/io-context')
const Image = require('./lib/image')
const InputFormat = require('./lib/input-format')
const OutputFormat = require('./lib/output-format')
const Packet = require('./lib/packet')
const Rational = require('./lib/rational')
const Resampler = require('./lib/resampler')
const Samples = require('./lib/samples')
const Scaler = require('./lib/scaler')
const Stream = require('./lib/stream')
const log = require('./lib/log')

// Helper to find hardware encoders by name (e.g., 'h264_videotoolbox', 'h264_mediacodec')
function findEncoderByName(name) {
  const handle = binding.findEncoderByName(name)
  return { _handle: handle, name }
}

// Helper to find hardware decoders by name (e.g., 'hevc_mediacodec', 'h264_videotoolbox')
function findDecoderByName(name) {
  const handle = binding.findDecoderByName(name)
  return { _handle: handle, name }
}

// Create a CodecContext from a named encoder/decoder
function createEncoderContext(name) {
  const encoder = findEncoderByName(name)
  return new CodecContext(encoder)
}

function createDecoderContext(name) {
  const decoder = findDecoderByName(name)
  return new CodecContext(decoder)
}

exports.AudioFIFO = AudioFIFO
exports.BitstreamFilter = BitstreamFilter
exports.ChannelLayout = ChannelLayout
exports.Codec = Codec
exports.CodecContext = CodecContext
exports.CodecParameters = CodecParameters
exports.Decoder = Decoder
exports.Dictionary = Dictionary
exports.Encoder = Encoder
exports.Filter = Filter
exports.FilterContext = FilterContext
exports.FilterGraph = FilterGraph
exports.FilterInOut = FilterInOut
exports.Frame = Frame
exports.HWDeviceContext = HWDeviceContext
exports.HWFramesContext = HWFramesContext
exports.HWFramesConstraints = HWFramesConstraints
exports.IOContext = IOContext
exports.Image = Image
exports.InputFormat = InputFormat
exports.InputFormatContext = InputFormatContext
exports.OutputFormat = OutputFormat
exports.OutputFormatContext = OutputFormatContext
exports.Packet = Packet
exports.Samples = Samples
exports.Scaler = Scaler
exports.Stream = Stream
exports.Rational = Rational
exports.Resampler = Resampler
exports.log = log

exports.constants = require('./lib/constants')

// Hardware codec helpers
exports.findEncoderByName = findEncoderByName
exports.findDecoderByName = findDecoderByName
exports.createEncoderContext = createEncoderContext
exports.createDecoderContext = createDecoderContext
