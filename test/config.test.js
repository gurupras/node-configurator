import path from 'path'
import Config, { ConfigObject } from '../src/config'

function testForEvent (obj, event, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(reject, timeout)
    obj.$on(event, (...args) => {
      clearTimeout(timer)
      return resolve(...args)
    })
  })
}

const badTypes = [
  null,
  undefined,
  'test',
  '',
  1,
  Number.NaN,
  Number.POSITIVE_INFINITY
]

let config
beforeEach(async () => {
  config = {
    type: 'test',
    server: {
      dev: {
        host: 'dev-host',
        port: 30
      },
      prod: {
        host: 'prod-host',
        port: 40
      }
    },
    plugins: [
      {
        name: 'analytics',
        path: 'plugins/analytics'
      },
      {
        name: 'opengraph',
        path: 'plugins/opengraph'
      }
    ],
    backend: {
      mongo: {
        url: 'mongodb://localhost'
      }
    }
  }
})

describe('ConfigObject', () => {
  test('Throws on Constructing with non-object', async () => {
    for (const t of badTypes) {
      expect(() => new ConfigObject(t)).toThrow()
    }
  })
})

describe('Config', () => {
  let cfg
  beforeEach(() => {
    cfg = { a: 1, b: 2, c: [1] }
  })

  describe('Simple', () => {
    test('Simple object test', async () => {
      expect(() => new Config(cfg)).not.toThrow()
      expect(new Config(cfg)).toEqual(cfg)
    })
    test('Throws error on non-object', async () => {
      for (const t of badTypes) {
        expect(() => new Config(t)).toThrow()
      }
    })

    test('Returns an equivalent object', async () => {
      const config = new Config(cfg)
      expect(config).toMatchObject(cfg)
    })
  })

  test('Parses YAML file correctly', async () => {
    expect(new Config(path.join(__dirname, './config.yaml'))).toMatchObject(config)
  })

  describe('Complex', () => {
    let cfg
    beforeEach(async () => {
      cfg = new Config(config)
    })

    afterEach(() => {
      cfg = null
    })

    test('Don\'t throws error if same object is used for a second config', async () => {
      expect(() => new Config(config)).not.toThrow()
    })

    test('Works for top-level array', async () => {
      expect(() => new Config(['1', '2', 3])).not.toThrow()
    })

    describe('Top-level', () => {
      test('Reactivity works on modification', async () => {
        const promise = testForEvent(cfg, 'change')
        cfg.type = 'dev'
        await expect(promise).toResolve()
      })

      test('Reactivity works when deleting a property', async () => {
        const promise = testForEvent(cfg, 'change')
        delete cfg.server
        await expect(promise).toResolve()
      })

      test('Reactivity works when setting property to null/undefined', async () => {
        let promise = testForEvent(cfg, 'change')
        cfg.type = null
        await expect(promise).toResolve()

        promise = testForEvent(cfg, 'change')
        cfg.server = undefined
        await expect(promise).toResolve()
      })
      test('Reactivity works when setting a new property', async () => {
        const promise = testForEvent(cfg, 'change')
        cfg.webrtc = {}
        await expect(promise).toResolve()
      })
    })

    describe('Nested', () => {
      test('Reactivity works on modification', async () => {
        const promises = [testForEvent(cfg.server.dev, 'change'), testForEvent(cfg.server, 'change'), testForEvent(cfg, 'change')]
        cfg.server.dev.host = 'dev'
        await expect(Promise.all(promises)).toResolve()
      })

      test('Reactivity works when deleting a property', async () => {
        const promises = [testForEvent(cfg.server.dev, 'change'), testForEvent(cfg.server, 'change'), testForEvent(cfg, 'change')]
        delete cfg.server.dev.host
        await expect(Promise.all(promises)).toResolve()
      })

      test('Reactivity works when setting property to null/undefined', async () => {
        let promises = [testForEvent(cfg.server.dev, 'change'), testForEvent(cfg.server, 'change'), testForEvent(cfg, 'change')]
        cfg.server.dev.host = null
        await expect(Promise.all(promises)).toResolve()

        promises = [testForEvent(cfg.server.dev, 'change'), testForEvent(cfg.server, 'change'), testForEvent(cfg, 'change')]
        cfg.server.dev.host = undefined
        await expect(Promise.all(promises)).toResolve()
      })
      test('Reactivity works when setting a new property', async () => {
        const promises = [testForEvent(cfg.server.dev, 'change'), testForEvent(cfg.server, 'change'), testForEvent(cfg, 'change')]
        cfg.server.dev.webrtc = {}
        await expect(Promise.all(promises)).toResolve()
      })
    })

    describe('$set', () => {
      test('Setting an existing property (object) unsubscribes it', async () => {
        const oldObj = cfg.server.dev
        const promise = testForEvent(cfg.server, 'change')
        expect(() => Config.$set(cfg.server, 'dev', 'dummy')).not.toThrow()
        await expect(promise).toResolve()

        const oldObjPromise = testForEvent(oldObj, 'change')
        const parentPromise = testForEvent(cfg.server, 'change')
        oldObj.host = 'test'

        await expect(parentPromise).toReject()
        await expect(oldObjPromise).toReject()
      })

      test('Setting a new property makes it reactive', async () => {
        expect(() => Config.$set(cfg.server.dev, 'proxy', {
          http: {
            host: 'localhost',
            port: 400
          }
        })).not.toThrow()
        // Now test changing this and ensuring that the change propagates to all levels
        const promises = [cfg.server.dev.proxy.http, cfg.server.dev.proxy, cfg.server.dev, cfg.server, cfg].map(x => testForEvent(x, 'change'))
        cfg.server.dev.proxy.http.blacklist = 'none'
        await expect(Promise.all(promises)).toResolve()
      })

      test('Calling non-static $set works', async () => {
        expect(() => cfg.server.dev.$set('proxy', {
          http: {
            host: 'localhost',
            port: 400
          }
        })).not.toThrow()
        // Now test changing this and ensuring that the change propagates to all levels
        const promises = [cfg.server.dev.proxy.http, cfg.server.dev.proxy, cfg.server.dev, cfg.server, cfg].map(x => testForEvent(x, 'change'))
        cfg.server.dev.proxy.http.blacklist = 'none'
        await expect(Promise.all(promises)).toResolve()
      })
    })
  })
})
