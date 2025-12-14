// api/webhook.js — Cal.com → ManyChat integration (v2 API)
export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const payload = req.body;
  if (!payload?.triggerEvent) {
    console.log('❌ Missing triggerEvent in payload');
    return res.status(400).json({ error: 'Missing payload data' });
  }

  try {
    const eventType = payload.triggerEvent;
    const userEmail = payload.payload?.attendees?.[0]?.email;

    console.log('--- START WEBHOOK EXECUTION ---');
    console.log('📧 El. paštas:', userEmail);
    console.log('📌 Įvykio tipas:', eventType);

    if (!userEmail) {
      console.error('❌ Nerastas el. paštas. Ignoruojama.');
      return res.status(400).json({ error: 'Missing email' });
    }

    // ✅ Išvalome API raktą nuo tarpų ir eilučių skirtukų
    const apiKey = (process.env.MANYCHAT_API_KEY || '').trim();
    if (!apiKey || apiKey.length < 20) {
      console.error('❌ ManyChat API raktas neįkeltas arba per trumpas');
      return res.status(500).json({ error: 'ManyChat API raktas neįkeltas' });
    }

    // 💡 Nustatome laiko formatą lietuviškai
    const bookingDate = new Date(payload.payload.startTime);
    const bookingTimeFormatted = bookingDate.toLocaleDateString('lt-LT', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
    });

    // 🔗 Google Meet nuoroda (jei yra)
    const meetingLink = payload.payload.metadata?.videoCallUrl || 'Bus pateikta vėliau';

    // 🔄 Siunčiame duomenis į ManyChat
    if (eventType === 'BOOKING_CREATED') {
      await sendManyChatUpdate(userEmail, 'Google_Meet_Nuoroda', meetingLink, apiKey);
      await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'PATVIRTINTA', apiKey);
      await sendManyChatUpdate(userEmail, 'Rezervacijos_Data_Laikas_text', bookingTimeFormatted, apiKey);

      console.log('✅ Rezervacija patvirtinta, duomenys išsiųsti į ManyChat');
      return res.status(200).json({ success: true, message: 'Duomenys sėkmingai išsiųsti' });

    } else if (eventType === 'BOOKING_CANCELLED') {
      await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'ATSAUKTA', apiKey);
      console.log('✅ Rezervacija atšaukta, statusas atnaujintas');
      return res.status(200).json({ success: true, message: 'Statusas atnaujintas' });
    }

    console.log(`⚠️ Ignoruojamas įvykis: ${eventType}`);
    return res.status(200).json({ success: true, message: `Ignoruojamas: ${eventType}` });

  } catch (error) {
    console.error('💥 Klaida apdorojant webhook:', error.message);
    return res.status(500).json({ error: 'Server error during processing' });
  }
};

// ✅ ManyChat v2 API funkcija — naudojanti updateProfile
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
    console.error(`💥 Klaida siunčiant į ManyChat (laukas: ${fieldName}):`, e.message);
  }
}
