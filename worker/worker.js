// Página para subir el video + config.json que lee el reproductor.
// GET /            -> formulario de subida
// GET /config.json -> config actual (lo consulta la tele cada 60 s)
// POST /upload     -> guarda el video en R2 y actualiza la config
const CORS = { 'Access-Control-Allow-Origin': '*' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/config.json') {
      const obj = await env.BUCKET.get('config.json');
      return new Response(obj ? obj.body : '{}', {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/upload' && req.method === 'POST') {
      if (req.headers.get('X-Password') !== env.UPLOAD_PASSWORD) {
        return new Response('Contraseña incorrecta', { status: 401 });
      }
      const type = req.headers.get('Content-Type') || '';
      if (!type.startsWith('video/')) return new Response('El archivo no es un video', { status: 400 });

      const version = Date.now();
      const key = `videos/${version}.mp4`;
      await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: type } });

      // ponytail: solo se guarda el último video; historial/rollback si alguien lo pide
      const old = await env.BUCKET.get('config.json').then((o) => (o ? o.json() : {}));
      await env.BUCKET.put('config.json', JSON.stringify({ video: `${env.PUBLIC_URL}/${key}`, version }));
      if (old.video && old.video.includes('/videos/')) {
        await env.BUCKET.delete(old.video.slice(env.PUBLIC_URL.length + 1));
      }
      return new Response('ok');
    }

    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
};

const PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cambiar video</title>
<style>
  body { font: 18px system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px 16px; background: #f4f4f4; color: #222; }
  h1 { font-size: 26px; }
  label { display: block; margin: 20px 0 6px; font-weight: 600; }
  input, button { width: 100%; box-sizing: border-box; font-size: 18px; padding: 14px; border-radius: 10px; border: 1px solid #bbb; }
  button { margin-top: 24px; background: #1a73e8; color: #fff; border: 0; font-weight: 600; }
  button:disabled { background: #999; }
  progress { width: 100%; height: 22px; margin-top: 20px; display: none; }
  #msg { margin-top: 18px; font-size: 20px; }
  video { width: 100%; margin-top: 12px; border-radius: 10px; background: #000; }
</style></head><body>
<h1>Cambiar el video de la tele</h1>
<label for="pw">Contraseña</label>
<input id="pw" type="password" autocomplete="current-password">
<label for="file">Video nuevo</label>
<input id="file" type="file" accept="video/*">
<button id="go">Subir video</button>
<progress id="bar" max="100" value="0"></progress>
<div id="msg" role="status"></div>
<label>Video que está en la tele ahora</label>
<video id="cur" controls muted playsinline></video>
<script>
  var $ = function (id) { return document.getElementById(id); };
  try { $('pw').value = localStorage.pw || ''; } catch (e) {}
  fetch('config.json').then(function (r) { return r.json(); }).then(function (c) { if (c.video) $('cur').src = c.video; });

  $('go').onclick = function () {
    var f = $('file').files[0];
    if (!f) { $('msg').textContent = 'Elegí un video primero.'; return; }
    if (f.size > 95 * 1024 * 1024) { $('msg').textContent = 'El video es muy grande (máximo 95 MB).'; return; }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'upload');
    xhr.setRequestHeader('X-Password', $('pw').value);
    xhr.setRequestHeader('Content-Type', f.type || 'video/mp4');
    xhr.upload.onprogress = function (e) { $('bar').value = e.loaded / e.total * 100; };
    xhr.onload = function () {
      $('go').disabled = false; $('bar').style.display = 'none';
      if (xhr.status === 200) {
        try { localStorage.pw = $('pw').value; } catch (e) {}
        $('msg').textContent = '✅ Listo. La tele lo va a mostrar en un minuto.';
        $('cur').src = URL.createObjectURL(f);
      } else { $('msg').textContent = '❌ ' + (xhr.responseText || 'Error al subir'); }
    };
    xhr.onerror = function () { $('go').disabled = false; $('msg').textContent = '❌ Sin conexión, probá de nuevo.'; };
    $('go').disabled = true; $('bar').style.display = 'block'; $('msg').textContent = 'Subiendo… no cierres esta página.';
    xhr.send(f);
  };
</script>
</body></html>`;
