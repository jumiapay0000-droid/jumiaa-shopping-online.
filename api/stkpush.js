export default async function handler(req, res) {
  // Allow POST for starting STK Push
  // Allow Safaricom POST callbacks to the same endpoint
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    // --------------------------------------------------
    // SAFARICOM CALLBACK
    // --------------------------------------------------
    if (body.Body?.stkCallback) {
      const callback = body.Body.stkCallback;

      console.log("M-PESA CALLBACK:", JSON.stringify(callback));

      // Safaricom expects a successful HTTP response
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received successfully"
      });
    }

    // --------------------------------------------------
    // START STK PUSH
    // --------------------------------------------------
    const { phone, amount } = body;

    if (!phone || !amount) {
      return res.status(400).json({
        error: "Phone number and amount are required"
      });
    }

    // Environment variables stored in Vercel
    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      return res.status(500).json({
        error: "Daraja consumer key or secret is missing"
      });
    }

    // --------------------------------------------------
    // GET ACCESS TOKEN
    // --------------------------------------------------
    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(500).json({
        error: "Could not obtain M-Pesa access token",
        details: tokenData
      });
    }

    // --------------------------------------------------
    // SANDBOX DETAILS
    // --------------------------------------------------

    const shortCode = "174379";

    /*
      IMPORTANT:
      Do NOT put your passkey in this public GitHub file.

      Add your existing Daraja SANDBOX passkey in Vercel
      as an environment variable named:

      DARAJA_PASSKEY
    */

    const passkey = process.env.DARAJA_PASSKEY;

    if (!passkey) {
      return res.status(500).json({
        error: "DARAJA_PASSKEY is missing in Vercel"
      });
    }

    // --------------------------------------------------
    // TIMESTAMP
    // Kenya time (UTC+3)
    // --------------------------------------------------

    const now = new Date(
      Date.now() + 3 * 60 * 60 * 1000
    );

    const timestamp =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, "0") +
      String(now.getUTCDate()).padStart(2, "0") +
      String(now.getUTCHours()).padStart(2, "0") +
      String(now.getUTCMinutes()).padStart(2, "0") +
      String(now.getUTCSeconds()).padStart(2, "0");

    // --------------------------------------------------
    // PASSWORD
    // --------------------------------------------------

    const password = Buffer.from(
      `${shortCode}${passkey}${timestamp}`
    ).toString("base64");

    // --------------------------------------------------
    // CALLBACK URL
    // --------------------------------------------------

    const appUrl =
      process.env.APP_URL ||
      `https://${req.headers.host}`;

    const callbackUrl = `${appUrl}/api/stkpush`;

    // --------------------------------------------------
    // PHONE NUMBER
    // --------------------------------------------------

    let phoneNumber = String(phone).replace(/\s+/g, "");

    // Convert 07XXXXXXXX to 2547XXXXXXXX
    if (phoneNumber.startsWith("07")) {
      phoneNumber = "254" + phoneNumber.substring(1);
    }

    // Convert +2547XXXXXXXX to 2547XXXXXXXX
    if (phoneNumber.startsWith("+254")) {
      phoneNumber = phoneNumber.substring(1);
    }

    // --------------------------------------------------
    // SEND STK PUSH
    // --------------------------------------------------

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(Number(amount)),
          PartyA: phoneNumber,
          PartyB: shortCode,
          PhoneNumber: phoneNumber,
          CallBackURL: callbackUrl,
          AccountReference: "JumiaaShop",
          TransactionDesc: "Jumiaa Shopping Online"
        })
      }
    );

    const result = await stkResponse.json();

    console.log("STK RESPONSE:", JSON.stringify(result));

    return res.status(stkResponse.status).json(result);

  } catch (error) {
    console.error("M-PESA ERROR:", error);

    return res.status(500).json({
      error: "M-Pesa request failed",
      message: error.message
    });
  }
}
