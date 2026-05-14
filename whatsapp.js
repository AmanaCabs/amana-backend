// ─── WHATSAPP SERVICE ───
// Generates booking confirmation messages and click-to-chat URLs.
// Uses the official wa.me link (free, no API key required) — opens
// WhatsApp on the customer's phone with a pre-filled message.
//
// For automated server-side message sending you'd integrate with the
// official WhatsApp Cloud API or a provider like Twilio. That requires
// a verified business account, so we keep this approach which works
// out of the box for any small business.

const BUSINESS_NAME = process.env.BUSINESS_NAME || "Amana Cab's";
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || '919700200513';

/**
 * Generate a customer-facing booking confirmation message.
 * Returns both the WhatsApp click-to-chat URL and the plain message text.
 */
function generateBookingMessage(booking) {
  const tripType = booking.trip_type === 'roundtrip' ? 'Round Trip' : 'One Way';

  const message = `🚗 *Booking Confirmed – ${BUSINESS_NAME}* 🎉

Hi ${booking.name}! Thank you for booking with *${BUSINESS_NAME}*.

📋 *Your Booking Summary*
• Booking ID: ${booking.id}
• Vehicle: ${booking.vehicle}
• Package: ${booking.package}
• Trip: ${tripType}
• Pickup: ${booking.pickup_address}, ${booking.city || ''}
• Drop: ${booking.drop_address || 'As discussed'}
• Date & Time: ${booking.travel_date} at ${booking.pickup_time || 'TBD'}
• Passengers: ${booking.persons}

Our team will call you shortly on ${booking.phone} to confirm.
Safe travels! 🌟

_Driven by Comfort, Defined by Class_
${BUSINESS_NAME} | +${BUSINESS_PHONE}`;

  // Strip non-digits from customer phone for wa.me URL
  const customerPhone = (booking.phone || '').replace(/\D/g, '');
  const customerWhatsappUrl = `https://wa.me/${customerPhone}?text=${encodeURIComponent(message)}`;

  // Business notification (sent to your number)
  const businessAlert = `🔔 *New Booking Received!*

ID: ${booking.id}
Name: ${booking.name}
Phone: ${booking.phone}
Vehicle: ${booking.vehicle}
Package: ${booking.package}
Date: ${booking.travel_date} ${booking.pickup_time || ''}
Pickup: ${booking.pickup_address}, ${booking.city || ''}
Persons: ${booking.persons}

Login to admin panel to confirm.`;

  const businessWhatsappUrl = `https://wa.me/${BUSINESS_PHONE}?text=${encodeURIComponent(businessAlert)}`;

  return {
    message,
    customerWhatsappUrl,
    businessWhatsappUrl,
    customerPhone,
  };
}

module.exports = { generateBookingMessage };
