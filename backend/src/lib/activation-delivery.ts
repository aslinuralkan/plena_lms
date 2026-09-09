import {
  discardActivationToken,
  issueActivationToken,
  keepOnlyActivationToken,
} from "./activation";
import { sendActivationEmail } from "./email";

export async function deliverUserActivation(input: {
  userId: string;
  customerId: string;
  email: string;
  name: string;
}) {
  const credentials = await issueActivationToken(input.userId);
  try {
    const delivery = await sendActivationEmail({
      to: input.email,
      name: input.name,
      code: credentials.code,
      token: credentials.token,
      customerId: input.customerId,
    });
    await keepOnlyActivationToken(input.userId, credentials.activation.id);
    return {
      sent: true,
      deliveryId: delivery.id,
      expiresAt: credentials.expiresAt.toISOString(),
    };
  } catch (error) {
    await discardActivationToken(credentials.activation.id).catch(
      (discardError) =>
        console.error(
          "Gönderilemeyen aktivasyon tokenı silinemedi:",
          discardError,
        ),
    );
    throw error;
  }
}
