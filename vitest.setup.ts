import '@testing-library/jest-dom/vitest'

// jsdom no trae <dialog>.showModal/close: se imitan lo justo (abrir, cerrar y avisar el cierre).
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype
  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (!proto.close) {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}

// XMLHttpRequest de jsdom saldría a la red de verdad. Las subidas con progreso (XHR) se prueban con el
// mismo `fetch` falso que ya usan los tests: este reemplazo lo busca en el momento de enviar. Un test que
// necesite eventos de progreso pone su propio XMLHttpRequest con vi.stubGlobal.
class XhrSobreFetch {
  status = 0
  responseText = ''
  upload: { onprogress: unknown } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  #metodo = 'GET'
  #url = ''
  open(metodo: string, url: string) {
    this.#metodo = metodo
    this.#url = url
  }
  send(cuerpo?: unknown) {
    Promise.resolve()
      .then(() => fetch(this.#url, { method: this.#metodo, body: cuerpo as BodyInit }))
      .then(async (r) => {
        this.status = r.status
        this.responseText = await r.text()
        this.onload?.()
      })
      .catch(() => this.onerror?.())
  }
  abort() {
    this.onabort?.()
  }
}
globalThis.XMLHttpRequest = XhrSobreFetch as unknown as typeof XMLHttpRequest
