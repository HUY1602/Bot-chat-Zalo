async function checkDetails() {
  const resSetup = await fetch('https://bot-chat-zalo-one.vercel.app/api/setup');
  const setup = await resSetup.json();
  const list = setup.env.avatarList;

  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    const res = await fetch(url);
    const headers = Object.fromEntries(res.headers.entries());
    console.log(`[${i+1}] ${url}`);
    console.log('   content-type:', headers['content-type']);
    console.log('   content-length:', headers['content-length']);
    console.log('   content-disposition:', headers['content-disposition']);
  }
}
checkDetails();

