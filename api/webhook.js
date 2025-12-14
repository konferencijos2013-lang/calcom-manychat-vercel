// api/webhook.js (Atnaujinta versija)
export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const payload = req.body;
  if (!payload?.triggerEvent) {
    return res.status(400).json({ error: 'Missing payload data' });
  }

  try {
    const eventType = payload.triggerEvent;
    const userEmail = payload.payload.attendees?.[0]?.email;

    console.log('--- START ---');
    console.log('📧 El. paštas:', userEmail);
    console.log('📌 Įvykis:', eventType);

    if (!userEmail) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // ✅ Išvalome raktą nuo tarpų (apsauga)
    const apiKey = (process.env.MANYCHAT_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 20) {
      console.error('❌ ManyChat API raktas neįkeltas arba per trumpas');
      return res.status(500).json({ error: 'ManyChat API raktas neįkeltas' });
    }

    if (eventType === 'BOOKING_CREATED') {
      const meetingLink = payload.payload.metadata?.videoCallUrl || 'Bus pateikta vėliau';
      const bookingDate = new Date(payload.payload.startTime);
      const bookingTimeFormatted = bookingDate.toLocaleDateString('lt-LT', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
      });

      await sendManyChatUpdate(userEmail, 'Google_Meet_Nuoroda', meetingLink, apiKey);
      await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'PATVIRTINTA', apiKey);
      await sendManyChatUpdate(userEmail, 'Rezervacijos_Data_Laikas_text', bookingTimeFormatted, apiKey);

      return res.status(200).json({ success: true, message: 'Duomenys išsiųsti į ManyChat' });

    } else if (eventType === 'BOOKING_CANCELLED') {
      await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'ATSAUKTA', apiKey);
      return res.status(200).json({ success: true, message: 'Statusas atnaujintas' });
    }

    return res.status(200).json({ success: true, message: `Ignoruojama: ${eventType}` });

  } catch (error) {
    console.error('💥 Klaida:', error.message);
    return res.status(500).json({ error: 'Vidaus klaida' });
  }
};

// ✅ NAUJAS ManyChat v2 API
async function sendManyChatUpdate(externalId, fieldName, fieldValue, apiKey) {
  const url = 'https://api.manychat.com/v2/subscriber/updateProfile';
  
  const payload = JSON.stringify({
    external_id: externalId,
    custom_fields: {
      [fieldName]: fieldValue
    }
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`❌ ManyChat klaida (${response.status}) | Laukas: ${fieldName} |`, result);
    } else {
      console.log(`✅ ManyChat sėkmė | Laukas: ${fieldName}`);
    }

  } catch (e) {
    console.error('💥 Siuntimo klaida:', e.message);
  }
}
