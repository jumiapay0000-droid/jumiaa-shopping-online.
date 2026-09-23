export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { phone, amount } = await req.json();

    if (!phone || !amount) {
      return new Response(JSON.stringify({
        error: "Phone number and amount are required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return new Response(JSON.stringify({
        error: "Could not obtain M-Pesa access token",
        details: tokenData
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);

    const shortcode = "174379";
    const passkey =
      "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

    const password = Buffer.from(
      shortcode + passkey + timestamp
    ).toString("base64");

    const host = req.headers.get("host");
    const callbackUrl = `https://${host}/api/stkpush`;

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(Number(amount)),
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: "JumiaaShop",
          TransactionDesc: "Jumiaa Shopping Online"
        })
      }
    );

    const result = await stkResponse.json();

    return new Response(JSON.stringify(result), {
      status: stkResponse.status,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: "M-Pesa request failed",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
