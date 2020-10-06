const fs = require('fs')
const yaml = require('js-yaml')

const Emittery = require('emittery')
const onChange = require('on-change')

const objectMap = new WeakMap()

function bindEmittery (obj) {
  const emittery = new Emittery()
  const methods = ['emit', 'on', 'off', 'once']
  for (const method of methods) {
    const k = `$${method}`
    Object.defineProperty(obj, k, {
      enumerable: false,
      configurable: false,
      value: emittery[method].bind(emittery)
    })
  }
  return obj
}

function createProxy (obj, overrides = {}) {
  const selfProxy = new Proxy(obj, {
    set () {
      return Reflect.set(...arguments)
    },
    get (object, k) {
      return object[k]
    },
    ...overrides
  })
  return selfProxy
}

function setupOnChange (obj) {
  const ret = onChange(obj, (path, v, o) => {
    if (o && objectMap.get(o)) {
      // This is an object created by us. Remove all listeners
      onChange.unsubscribe(o)
    }
    obj.$emit('change', [path, o, v])
  })
  objectMap.set(ret, true)
  return ret
}

function $set (obj, k, v) {
  const val = processConfigEntry(v)
  obj[k] = val
  return obj
}

class ConfigObject {
  constructor (config) {
    if (config === null || config === undefined || typeof config !== 'object') {
      throw new Error(`Invalid config type. Expecting object; got '${typeof config}'`)
    }

    bindEmittery(this)
    const selfProxy = createProxy(this)

    for (const key of Object.keys(config)) {
      const value = config[key]
      selfProxy[key] = processConfigEntry(value)
    }
    return setupOnChange(selfProxy)
  }

  $set (...args) {
    return $set(this, ...args)
  }
}

function processConfigEntry (entry) {
  if (Array.isArray(entry)) {
    const ret = setupOnChange(bindEmittery([]))
    for (const e of entry) {
      ret.push(processConfigEntry(e))
    }
    return ret
  } else if (entry !== null && entry !== undefined && typeof entry === 'object') {
    return new ConfigObject(entry)
  } else {
    return entry
  }
}

class Config {
  constructor (config) {
    if (typeof config === 'string') {
      // This is expected to be a YAML file path
      config = yaml.safeLoad(fs.readFileSync(config, 'utf-8'))
    }
    if (config === null || config === undefined || typeof config !== 'object') {
      throw new Error('Invalid config type. Expecting object.')
    }
    return processConfigEntry(config)
  }

  static $set (...args) {
    return $set(...args)
  }
}

module.exports = {
  Config,
  ConfigObject
}
