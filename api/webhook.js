// Importuojame node-fetch, kad galėtume atlikti išorinius API kvietimus (į ManyChat)
import fetch from 'node-fetch';

// Nustatome ManyChat API endpoint'us
const MANYCHAT_API_URL = 'https://api.manychat.com/fb/subscriber/setCustomField'; 

/**
 * Pagrindinė funkcija, kurią iškviečia Vercel Serverless Function.
 */
export default async (req, res) => {
    // 1. Patikriname, ar metodas yra POST (Cal.com siunčia POST)
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // 2. Patikriname, ar gavome duomenis
    const payload = req.body;

    if (!payload || !payload.triggerEvent) {
        console.error('Klaida: Nerasta jokių duomenų iš Webhook.');
        return res.status(400).json({ error: 'Missing payload data' });
    }

    try {
        const eventType = payload.triggerEvent;
        // Naudojame optional chaining (?.)
        const userEmail = payload.payload.attendees[0]?.email;

        if (!userEmail) {
            console.error('Klaida: Nerastas el. paštas Webhook\'e.');
            return res.status(400).json({ error: 'Missing email' });
        }

        // ManyChat API Raktas imamas iš Vercel aplinkos kintamųjų (SAUGUMAS)
        const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY;

        if (eventType === 'BOOKING_CREATED') {

            // Duomenų išgavimas (naudojant patikrintą kelią)
            const meetingLink = payload.payload.metadata?.videoCallUrl || "Nuoroda bus atsiųsta atskiru pranešimu."; 
            const bookingDate = new Date(payload.payload.startTime);

            // Datos formatavimas
            const bookingTimeFormatted = bookingDate.toLocaleDateString('lt-LT', {
                year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
            });

            // Vykdome atnaujinimus asynchriniu būdu
            await sendManyChatUpdate(userEmail, 'Google_Meet_Nuoroda', meetingLink, MANYCHAT_API_KEY);
            await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'PATVIRTINTA', MANYCHAT_API_KEY);
            // Šis veiksmas PALEIDŽIA PATVIRTINIMO SRAUTĄ
            await sendManyChatUpdate(userEmail, 'Rezervacijos_Data_Laikas_text', bookingTimeFormatted, MANYCHAT_API_KEY);

            return res.status(200).json({ success: true, message: "Rezervacija patvirtinta, duomenys išsiųsti į ManyChat" });

        } else if (eventType === 'BOOKING_CANCELLED') {
            await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'ATSAUKTA', MANYCHAT_API_KEY);
            return res.status(200).json({ success: true, message: "Rezervacija atšaukta, statusas atnaujintas" });
        }

        return res.status(200).json({ success: true, message: `Įvykis ignoruojamas: ${eventType}` });

    } catch (error) {
        console.error('Klaida apdorojant Webhook:', error);
        return res.status(500).json({ error: 'Server error during processing' });
    }
};


/**
 * Pagalbinė funkcija siųsti duomenis į ManyChat Custom Field (Node.js fetch versija).
 */
async function sendManyChatUpdate(externalId, fieldName, fieldValue, apiKey) {
    const payload = JSON.stringify({
        external_id: externalId, 
        field_name: fieldName, 
        field_value: fieldValue
    });

    try {
        const response = await fetch(MANYCHAT_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: payload
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`ManyChat klaida (HTTP ${response.status} / Laukas: ${fieldName}): ${errorText}`);
        }
    } catch (e) {
        console.error('Klaida siunčiant į ManyChat:', e);
    }
}
