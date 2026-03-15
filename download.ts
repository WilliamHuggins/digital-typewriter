import fs from 'fs';
import path from 'path';
import https from 'https';

const files = [
  { name: 'carriage-return-1.wav', id: '1JNcjdhJykoyzvOoFQLr5TtMouvw836jK' },
  { name: 'bell-1.wav', id: '1LbX08vj0pnO-9zyWdSnHr2yPyBEOKauK' },
  { name: 'hard-click.wav', id: '1HAbHoXa5oxFdG5LGY0L82JobbnJyvSuB' },
  { name: 'keyboard-typing.wav', id: '15Mpw_VTp6SzBkbRLRq6MdyK4KQNihi4O' },
  { name: 'mechanical-hit.wav', id: '1AqRPSOS4EoE8_fh557PVlo1sY4T3xmcB' },
  { name: 'mechanical-single-hit.wav', id: '18AMcAWv2ZV6w3g2z7qamJ6TiBul5KP5R' },
  { name: 'old-typing.wav', id: '17ZPReJtMfj1tWX2QI1G4ZUmN3gZ0SNfl' },
  { name: 'typewriter-hit.wav', id: '18qo3gqXIatpEP6B5YbK8nSWi7EHiPgII' },
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

  return new Promise<void>((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 303) {
          https
            .get(response.headers.location!, (redirectResponse) => {
              const file = fs.createWriteStream(destPath);
              redirectResponse.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            })
            .on('error', reject);
        } else {
          const file = fs.createWriteStream(destPath);
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }
      })
      .on('error', reject);
  });
}

function writeBase64Asset(binaryPath: string) {
  const bytes = fs.readFileSync(binaryPath);
  const b64Path = `${binaryPath}.b64`;
  fs.writeFileSync(b64Path, bytes.toString('base64'));
  fs.unlinkSync(binaryPath);
}

async function main() {
  for (const file of files) {
    console.log(`Downloading ${file.name}...`);
    const binaryPath = path.join(dir, file.name);

    try {
      await downloadFile(file.id, binaryPath);
      writeBase64Asset(binaryPath);
      console.log(`Saved ${file.name}.b64`);
    } catch (e) {
      console.error(`Failed to download ${file.name}:`, e);
    }
  }
}

main();
