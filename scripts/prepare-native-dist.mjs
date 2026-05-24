import { access, readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../dist/index.html", import.meta.url);
const html = await readFile(indexPath, "utf8");
const nativeHtml = html.replaceAll('src="/vault/', 'src="./').replaceAll('href="/vault/', 'href="./');

await writeFile(indexPath, nativeHtml);

const iosInfoPlistPath = new URL("../ios/App/App/Info.plist", import.meta.url);
const iosPermissions = [
  {
    key: "NSCameraUsageDescription",
    value: "Vault uses the camera so you can photograph storage spots and saved items.",
  },
  {
    key: "NSPhotoLibraryUsageDescription",
    value: "Vault uses your photo library so you can add existing photos to saved locations.",
  },
  {
    key: "NSPhotoLibraryAddUsageDescription",
    value: "Vault can save photos you add to your device photo library when you choose to.",
  },
];

if (await fileExists(iosInfoPlistPath)) {
  let plist = await readFile(iosInfoPlistPath, "utf8");
  for (const permission of iosPermissions) {
    if (plist.includes(`<key>${permission.key}</key>`)) continue;
    plist = plist.replace(
      "</dict>",
      `\t<key>${permission.key}</key>\n\t<string>${permission.value}</string>\n</dict>`,
    );
  }
  await writeFile(iosInfoPlistPath, plist);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
