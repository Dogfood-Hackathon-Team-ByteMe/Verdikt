import mongoose from "mongoose";

/**
 * This instance's Ed25519 signing keypair, minted on first use and then fixed.
 *
 * In the database rather than a file so it lives in the same volume as
 * everything else and survives a container rebuild -- if it did not, every
 * certificate ever issued would stop verifying on the next `docker compose
 * build`. The private key never leaves this collection; the public key is
 * served to anyone who asks, which is the point of it.
 */
const signingKeySchema = new mongoose.Schema(
	{
		// A fixed name keyed uniquely, so concurrent first-writers collide on
		// the index and one keypair wins.
		name: { type: String, required: true, unique: true },
		publicKeyPem: { type: String, required: true },
		privateKeyPem: { type: String, required: true },
	},
	{ timestamps: true },
);

export default mongoose.model("SigningKey", signingKeySchema);
