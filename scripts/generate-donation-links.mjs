import Stripe from 'stripe';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const donations = [
  { name: 'Beverage Donation', defaultAmount: 900 },
  { name: 'Door Donation', defaultAmount: 2000 },
];

const outputDir = path.resolve(import.meta.dirname, '..', 'public', 'qr');

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  for (const donation of donations) {
    const slug = donation.name.toLowerCase().replace(/\s+/g, '-');

    console.log(`Creating payment link for "${donation.name}" ($${(donation.defaultAmount / 100).toFixed(2)} default)...`);

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: donation.name },
            custom_unit_amount: {
              enabled: true,
              default: donation.defaultAmount,
            },
          },
          quantity: 1,
          adjustable_quantity: { enabled: false },
        },
      ],
      metadata: { type: 'donation', slug },
    });

    console.log(`  Link: ${paymentLink.url}`);

    // Generate QR code
    const qrPath = path.join(outputDir, `${slug}.png`);
    await QRCode.toFile(qrPath, paymentLink.url, {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    console.log(`  QR code saved: public/qr/${slug}.png`);
    console.log();
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
