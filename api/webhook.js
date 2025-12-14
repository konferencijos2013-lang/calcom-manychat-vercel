// api/webhook.js
import fetch from 'node-fetch';

// Nurodome ManyChat API V2 URL kontaktų atnaujinimui
const MANYCHAT_API_URL = 'https://api.manychat.com/api/v2/contacts';

/**
 * Pagrindinė Webhook funkcija, apdorojanti Cal.com įvykius
 */
export default async (req, res) => {
    // Tikriname, ar užklausa yra POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Tik POST užklausos priimamos' });
    }

    const {
        event,
        payload
    } = req.body;

    if (!payload || !event) {
        return res.status(400).json({ message: 'Trūksta Cal.com įvykio duomenų' });
    }

    const externalId = payload.attendees[0]?.email; // Naudojame el. paštą kaip External ID
    const meetingLink = payload.location;
    const bookingTime = payload.startTime; 
    const bookingStatus = "Patvirtinta"; 

    // Paimame API raktą iš Vercel aplinkos kintamųjų
    const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY;

    if (!MANYCHAT_API_KEY) {
        console.error('KLAIDA: Trūksta MANYCHAT_API_KEY aplinkos kintamojo.');
        return res.status(500).json({ message: 'Serverio klaida: Trūksta API rakto.' });
    }

    console.log(`--- START VERCEL EXECUTION ---`);
    console.log(`Ištrauktas el. paštas (External ID): ${externalId}`);
    console.log(`Įvykio tipas: ${event}`);

    if (event === 'BOOKING_CREATED') {
        const updates = [
            { fieldName: 'Google_Meet_Nuoroda', fieldValue: meetingLink },
            { fieldName: 'Konsultacijos_Statusas', fieldValue: bookingStatus },
            { fieldName: 'Rezervacijos_Data_Laikas_text', fieldValue: bookingTime }
        ];

        let success = true;
        for (const update of updates) {
            const result = await sendManyChatUpdate(externalId, update.fieldName, update.fieldValue, MANYCHAT_API_KEY);
            if (!result) {
                success = false;
            }
        }

        if (success) {
            console.log('--- Visi laukai SĖKMINGAI ATNAUJINTI MANYCHAT ---');
            return res.status(200).json({ message: 'Sėkmė: ManyChat laukai atnaujinti.' });
        } else {
            console.error('--- KLAIDA: NEPAVYKO ATNAUJINTI VISŲ LAUKŲ MANYCHAT ---');
            // Grąžiname 200, kad Cal.com negautų klaidos, bet registruojame problemą
            return res.status(200).json({ message: 'Įvykdytas su klaidomis (žr. žurnalus).' });
        }
    }

    return res.status(200).json({ message: 'Įvykis apdorotas (bet neatitinka BOOKING_CREATED).' });
};

/**
 * Pagalbinė funkcija siųsti duomenis į ManyChat V2 API
 */
async function sendManyChatUpdate(externalId, fieldName, fieldValue, apiKey) {
    // --- API Rakto apdorojimas (kritinis) ---
    // Naudojame tik API raktą be Page ID ar dvitaškio
    let bearerToken = apiKey.includes(':') ? apiKey.split(':')[1] : apiKey;
    // ----------------------------------------

    const payload = JSON.stringify({
        external_id: externalId,
        custom_fields: [{
            name: fieldName,
            value: fieldValue
        }]
    });

    try {
        const response = await fetch(MANYCHAT_API_URL, {
            method: 'POST',
            headers: {
                // ManyChat V2 naudoja Bearer Token
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: payload
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`ManyChat SĖKMĖ: Laukas ${fieldName} atnaujintas.`);
            return true;
        } else {
            console.error(`ManyChat KLAIDA (HTTP ${response.status} / Laukas: ${fieldName}): ${JSON.stringify(data)}`);
            return false;
        }
    } catch (e) {
        console.error('Bendroji klaida siunčiant į ManyChat:', e);
        return false;
    }
}
