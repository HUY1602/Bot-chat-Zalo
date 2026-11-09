const fs = require('fs');

async function inspectImages() {
  const resSetup = await fetch('https://bot-chat-zalo-one.vercel.app/api/setup');
  const setup = await resSetup.json();
  const list = setup.env.avatarList;

  console.log(`Checking ${list.length} images...`);
  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    
    // Check magic bytes
    let format = 'unknown';
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
      format = 'JPEG';
    } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      format = 'PNG';
    } else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      format = 'WEBP';
    } else if (buf.slice(0, 6).toString() === 'GIF87a' || buf.slice(0, 6).toString() === 'GIF89a') {
      format = 'GIF';
    }

    console.log(`[${i + 1}] Size: ${buf.length} bytes, Format detected: ${format}, Header Content-Type: ${res.headers.get('content-type')}`);
    if (format === 'unknown') {
      console.log('   First 32 bytes:', buf.slice(0, 32).toString('hex'), buf.slice(0, 32).toString('utf-8'));
    }
  }
}

inspectImages();

