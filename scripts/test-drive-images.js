async function test() {
  const resSetup = await fetch('https://bot-chat-zalo-one.vercel.app/api/setup');
  const setup = await resSetup.json();
  const list = setup.env.avatarList;
  console.log('Total images found in avatarList:', list.length);

  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    try {
      const res = await fetch(url, { method: 'GET' });
      const ct = res.headers.get('content-type');
      const cl = res.headers.get('content-length');
      const buf = await res.arrayBuffer();
      const actualBytes = buf.byteLength;
      const isHtml = ct && ct.includes('text/html');
      console.log(`[${i + 1}/${list.length}] Status: ${res.status}, Type: ${ct}, Size: ${(actualBytes / 1024 / 1024).toFixed(2)} MB ${isHtml ? '❌ HTML PAGE (NOT IMAGE!)' : '✅'} -> ${url}`);
    } catch (e) {
      console.log(`[${i + 1}/${list.length}] ❌ ERROR: ${e.message} -> ${url}`);
    }
  }
}

test();

