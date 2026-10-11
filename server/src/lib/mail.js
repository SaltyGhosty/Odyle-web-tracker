// Envío por Resend. Nunca registra la clave ni el cuerpo; los errores solo por código y no se lanzan.
export function createMailer(config, { fetchImpl = globalThis.fetch, log = console } = {}) {
  return {
    async send({ to, subject, text }) {
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.resendKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) log.error('Error al enviar correo', { status: res.status });
      } catch (err) {
        log.error('Error al enviar correo', { code: err && (err.code || err.name) });
      }
    },
  };
}
