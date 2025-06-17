import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_API_BASE = 'https://api.leads-magician.com/api';
const API_SECRET_KEY = 'VoarWqi3dh6tslo9ClU5WNjT4lAHJIAL';

export async function GET(request: NextRequest) {
  try {

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };


    if (API_SECRET_KEY) {
      headers['Authorization'] = `Bearer ${API_SECRET_KEY}`;
    }

   
    const response = await fetch(`${EXTERNAL_API_BASE}/v1/industries`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      console.error('❌ External API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `External API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error in industries API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch industries data' },
      { status: 500 }
    );
  }
}
