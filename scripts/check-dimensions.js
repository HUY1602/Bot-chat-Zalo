function getJpegDimensions(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

async function check() {
  const resSetup = await fetch('https://bot-chat-zalo-one.vercel.app/api/setup');
  const setup = await resSetup.json();
  const list = setup.env.avatarList;

  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const dim = getJpegDimensions(buf);
    console.log(`[${i+1}] ${dim ? `${dim.width}x${dim.height}` : 'unknown dim'} - ${(buf.length/1024).toFixed(1)} KB - ${url}`);
  }
}

check();

