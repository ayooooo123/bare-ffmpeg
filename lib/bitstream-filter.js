const binding = require('../binding')
const CodecParameters = require('./codec-parameters')
const Rational = require('./rational')

module.exports = class BitstreamFilter {
  constructor(name) {
    this._handle = binding.initBSFContext(name)
    this._initialized = false
  }

  destroy() {
    if (this._handle) {
      binding.destroyBSFContext(this._handle)
      this._handle = null
    }
  }

  setInputCodecParameters(codecParameters) {
    binding.setBSFInputCodecParameters(this._handle, codecParameters._handle)
  }

  get inputTimeBase() {
    const view = new Int32Array(binding.getBSFInputTimeBase(this._handle))
    return new Rational(view[0], view[1])
  }

  set inputTimeBase(value) {
    binding.setBSFInputTimeBase(this._handle, value.numerator, value.denominator)
  }

  get outputTimeBase() {
    const view = new Int32Array(binding.getBSFOutputTimeBase(this._handle))
    return new Rational(view[0], view[1])
  }

  get outputCodecParameters() {
    const handle = binding.getBSFOutputCodecParameters(this._handle)
    return new CodecParameters(handle, true)
  }

  init() {
    binding.initBSF(this._handle)
    this._initialized = true
  }

  sendPacket(packet) {
    if (packet === null) {
      return binding.sendBSFPacket(this._handle, null)
    }
    return binding.sendBSFPacket(this._handle, packet._handle)
  }

  receivePacket(packet) {
    return binding.receiveBSFPacket(this._handle, packet._handle)
  }

  flush() {
    binding.flushBSF(this._handle)
  }

  filterPacket(packet) {
    if (!this.sendPacket(packet)) {
      return false
    }
    return this.receivePacket(packet)
  }

  [Symbol.dispose]() {
    this.destroy()
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: BitstreamFilter },
      initialized: this._initialized,
      inputTimeBase: this.inputTimeBase,
      outputTimeBase: this._initialized ? this.outputTimeBase : null
    }
  }
}
