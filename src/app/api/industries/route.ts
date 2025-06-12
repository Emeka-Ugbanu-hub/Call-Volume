import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_API_BASE = 'https://api.leads-magician.com/api';
const API_SECRET_KEY = 'VoarWqi3dh6tslo9ClU5WNjT4lAHJIAL';

export async function GET(request: NextRequest) {
  try {
    console.log('🏭 Fetching industries from external API...');

    // Prepare headers for the external API request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key for authentication
    if (API_SECRET_KEY) {
      headers['Authorization'] = `Bearer ${API_SECRET_KEY}`;
    }

    // Make request to external API
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
    console.log('✅ Industries fetched successfully');

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error in industries API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch industries data' },
      { status: 500 }
    );
  }
}
