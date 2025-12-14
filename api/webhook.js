// api/webhook.js (Atnaujinta versija)

import fetch from 'node-fetch';

const MANYCHAT_API_URL = 'https://api.manychat.com/fb/subscriber/setCustomField'; 

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    const payload = req.body;

    if (!payload || !payload.triggerEvent) {
        return res.status(400).json({ error: 'Missing payload data' });
    }

    try {
        const eventType = payload.triggerEvent;
        // Pataisytas ir patikrintas el. pašto kelias, remiantis Cal.com struktūra
        const userEmail = payload.payload.attendees[0]?.email; 
        
        // --- 1. SVARBU: LOG'AS TESTAVIMUI ---
        console.log('--- START VERCEL EXECUTION ---');
        console.log('Ištrauktas el. paštas (External ID): ' + userEmail);
        console.log('Įvykio tipas: ' + eventType);
        // ------------------------------------

        if (!userEmail) {
            console.error('Klaida: Nerastas el. paštas Webhook\'e. Ignoruojama.');
            return res.status(400).json({ error: 'Missing email' });
        }

        const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY;

        if (eventType === 'BOOKING_CREATED') {
            
            // Duomenų išgavimas
            const meetingLink = payload.payload.metadata?.videoCallUrl || "Nuoroda bus atsiųsta atskiru pranešimu."; 
            
            // Jūsų nustatyta startTime (ISO formatu)
            const bookingDate = new Date(payload.payload.startTime);

            // Datos formatavimas (liet. kalba, kaip Make.com modulyje)
            const bookingTimeFormatted = bookingDate.toLocaleDateString('lt-LT', {
                year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
            });

            // Vykdome atnaujinimus asynchriniu būdu
            await sendManyChatUpdate(userEmail, 'Google_Meet_Nuoroda', meetingLink, MANYCHAT_API_KEY);
            await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'PATVIRTINTA', MANYCHAT_API_KEY);
            await sendManyChatUpdate(userEmail, 'Rezervacijos_Data_Laikas_text', bookingTimeFormatted, MANYCHAT_API_KEY);

            console.log('--- SUKŪRIMO ĮVYKIS SĖKMINGAI IŠSIŲSTAS Į MANYCHAT ---');
            return res.status(200).json({ success: true, message: "Rezervacija patvirtinta, duomenys išsiųsti į ManyChat" });

        } else if (eventType === 'BOOKING_CANCELLED') {
            await sendManyChatUpdate(userEmail, 'Konsultacijos_Statusas', 'ATSAUKTA', MANYCHAT_API_KEY);
            console.log('--- ATSAUKIMO ĮVYKIS SĖKMINGAI IŠSIŲSTAS Į MANYCHAT ---');
            return res.status(200).json({ success: true, message: "Rezervacija atšaukta, statusas atnaujintas" });
        }
        
        return res.status(200).json({ success: true, message: `Įvykis ignoruojamas: ${eventType}` });
        
    } catch (error) {
        console.error('Klaida apdorojant Webhook:', error);
        return res.status(500).json({ error: 'Server error during processing' });
    }
};


/**
 * Pagalbinė funkcija siųsti duomenis į ManyChat Custom Field (DABAR RODO SĖKMĖS/KLAIDOS LOG'US).
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

        // --- 2. SVARBU: RODO MANYCHAT API ATSAKĄ ---
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`ManyChat KLAIDA (HTTP ${response.status} / Laukas: ${fieldName}): ${errorText}`);
        } else {
            console.log(`ManyChat SĖKMĖ: Laukas ${fieldName} atnaujintas.`);
        }
        // ---------------------------------------------
        
    } catch (e) {
        console.error('Bendroji klaida siunčiant į ManyChat:', e);
    }
}
