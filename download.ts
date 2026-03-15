import fs from 'fs';
import path from 'path';
import https from 'https';

const files = [
  { name: 'carriage-return-1.wav', id: '1JNcjdhJykoyzvOoFQLr5TtMouvw836jK' },
  { name: 'bell-1.wav', id: '1LbX08vj0pnO-9zyWdSnHr2yPyBEOKauK' },
  { name: 'carriage-return-2.flac', id: '1Umm8A4rDLt8R4AT64E-XHVJBXQ1lukdI' },
  { name: 'typing-loop.mp3', id: '137rtKHRzB3v-rGHFlXzaLTfUru6eGMi3' },
  { name: 'hard-click.wav', id: '1HAbHoXa5oxFdG5LGY0L82JobbnJyvSuB' },
  { name: 'keyboard-typing.wav', id: '15Mpw_VTp6SzBkbRLRq6MdyK4KQNihi4O' },
  { name: 'mechanical-hit.wav', id: '1AqRPSOS4EoE8_fh557PVlo1sY4T3xmcB' },
  { name: 'mechanical-single-hit.wav', id: '18AMcAWv2ZV6w3g2z7qamJ6TiBul5KP5R' },
  { name: 'old-typing.wav', id: '17ZPReJtMfj1tWX2QI1G4ZUmN3gZ0SNfl' },
  { name: 'typewriter-hit.wav', id: '18qo3gqXIatpEP6B5YbK8nSWi7EHiPgII' },
  { name: 'return-bell.wav', id: '1ZjWAr-SryueOj9mB_F3v3Xf-tIyGNS0P' },
  { name: 'single-mechanical-hit.wav', id: '1Zk5kja1DG1ummUprtrzGupXBWfyLpXT3' },
  { name: 'soft-click.wav', id: '1OWdIpQoKjd_qdX7aKLowBrLTwQWCr-Ub' },
  { name: 'soft-hit.wav', id: '12NnYLqSwalrV5NkBnJ7NfeMQ6qPzfiVg' },
  { name: 'electric-typing.wav', id: '1SyUGuk-Jn6v6DWiPNyH7dSYKN339PeAB' },
  { name: 'electronic-typing.wav', id: '1UK1bLasbpJ3-p9Djgr7Daxb1Wr3VhZ8v' }
];

const dir = path.join(process.cwd(), 'public', 'sounds');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadFile(fileId: string, destPath: string) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 303) {
        // Handle redirect
        https.get(response.headers.location!, (redirectResponse) => {
          const file = fs.createWriteStream(destPath);
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(true);
          });
        }).on('error', reject);
      } else {
        const file = fs.createWriteStream(destPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
      }
    }).on('error', reject);
  });
}

async function main() {
  for (const file of files) {
    console.log(`Downloading ${file.name}...`);
    try {
      await downloadFile(file.id, path.join(dir, file.name));
      console.log(`Downloaded ${file.name}`);
    } catch (e) {
      console.error(`Failed to download ${file.name}:`, e);
    }
  }
}

main();
