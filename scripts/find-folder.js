async function checkDriveHtml() {
  const resSetup = await fetch('https://bot-chat-zalo-one.vercel.app/api/setup');
  const setup = await resSetup.json();
  console.log('avatarSource:', setup.env.avatarSource);

  // Let's get the folder ID from avatar-service
  // In avatar-service.js, it calls https://drive.google.com/embeddedfolderview?id=...
  // How can we find the folder ID?
}

