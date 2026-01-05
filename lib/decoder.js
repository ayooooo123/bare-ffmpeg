const binding = require('../binding')

module.exports = class FFmpegDecoder {
  constructor(codec) {
    this._codec = codec
    this._handle = binding.findDecoderByID(codec._id)
  }

  static byName(name) {
    const decoder = new FFmpegDecoder.__proto__.constructor()
    decoder._handle = binding.findDecoderByName(name)
    decoder._codec = null
    return decoder
  }
}

// Factory method to find decoder by name (e.g., 'hevc_mediacodec', 'h264_videotoolbox')
FFmpegDecoder.findByName = function (name) {
  return {
    _handle: binding.findDecoderByName(name),
    _codec: null
  }
}
