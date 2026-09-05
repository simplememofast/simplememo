import crypto from 'node:crypto';

const AAD = Buffer.from('simplememo-analytics-export-v1');
export function recipientKey(pem) {
  if (typeof pem !== 'string' || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('An RSA public key in SPKI PEM format is required');
  }
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072) {
    throw new Error('Use an RSA public key with at least 3072 bits');
  }
  return key;
}
function fingerprint(key) {
  return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}
export function seal(payload, pem) {
  const recipient = recipientKey(pem);
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const wrappedKey = crypto.publicEncrypt({
    key: recipient, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, key);
  key.fill(0);
  return {
    version: 1, algorithm: 'RSA-OAEP-SHA256+A256GCM', recipient_sha256: fingerprint(recipient),
    wrapped_key: wrappedKey.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64'),
  };
}
export function unseal(envelope, privatePem) {
  const privateKey = crypto.createPrivateKey(privatePem);
  if (envelope.version !== 1 || envelope.algorithm !== 'RSA-OAEP-SHA256+A256GCM' ||
      fingerprint(crypto.createPublicKey(privateKey)) !== envelope.recipient_sha256) {
    throw new Error('Unsupported envelope or wrong recipient key');
  }
  const key = crypto.privateDecrypt({
    key: privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  }, Buffer.from(envelope.wrapped_key, 'base64'));
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final(),
    ]).toString('utf8'));
  } finally { key.fill(0); }
}
