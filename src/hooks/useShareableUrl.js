// Encode/decode form data into a shareable URL query param using CompressionStream

async function compress(str) {
  const encoder = new TextEncoder();
  const input = encoder.encode(str);
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  // base64url encode
  return btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function decompress(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

export async function encodeFormDataToUrl(formData) {
  const json = JSON.stringify(formData);
  const encoded = await compress(json);
  const url = new URL(window.location.href);
  url.searchParams.set('assessment', encoded);
  return url.toString();
}

export async function decodeFormDataFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('assessment');
  if (!encoded) return null;
  try {
    const json = await decompress(encoded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function clearAssessmentParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('assessment');
  window.history.replaceState({}, '', url.toString());
}
