const binding = require('../binding')

class FFmpegEncoder {
  constructor(codec) {
    this._codec = codec
    this._handle = binding.findEncoderByID(codec._id)
  }

  static byName(name) {
    const encoder = new FFmpegEncoder.__proto__.constructor()
    encoder._handle = binding.findEncoderByName(name)
    encoder._codec = null
    return encoder
  }
}

// Factory method to find encoder by name (e.g., 'h264_videotoolbox', 'h264_mediacodec')
FFmpegEncoder.findByName = function (name) {
  return {
    _handle: binding.findEncoderByName(name),
    _codec: null
  }
}

module.exports = FFmpegEncoder
