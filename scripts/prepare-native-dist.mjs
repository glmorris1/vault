import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../dist/index.html", import.meta.url);
const html = await readFile(indexPath, "utf8");
const nativeHtml = html.replaceAll('src="/vault/', 'src="./').replaceAll('href="/vault/', 'href="./');

await writeFile(indexPath, nativeHtml);
