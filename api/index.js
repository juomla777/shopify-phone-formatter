const https = require('https' );

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

function formatEgyptianPhoneNumber(phone) {
  if (!phone) return null;
  
  let cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
    return '+20' + cleanPhone.substring(1);
  }
  
  if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
    return '+20' + cleanPhone;
  }
  
  if (cleanPhone.startsWith('201') && cleanPhone.length === 12) {
    return '+' + cleanPhone;
  }
  
  if (phone.includes('+20') && cleanPhone.length === 12) {
    return '+' + cleanPhone;
  }
  
  return null;
}

function updateCustomerPhone(customerId, formattedPhone) {
  return new Promise((resolve, reject) => {
    const query = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            phone
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: customerId,
        phone: formattedPhone
      }
    };

    const data = JSON.stringify({ query, variables });

    const options = {
      hostname: SHOPIFY_DOMAIN,
      path: '/admin/api/2024-01/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res ) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseBody);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const customer = req.body;
    
    if (!customer || !customer.id) {
      console.log('Invalid payload: missing customer or customer.id');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const phone = customer.phone || customer.default_address?.phone;
    
    if (!phone) {
      console.log(`Customer ${customer.id} has no phone number.`);
      return res.status(200).json({ message: 'No phone number to update' });
    }

    const formattedPhone = formatEgyptianPhoneNumber(phone);
    
    if (formattedPhone && formattedPhone !== phone) {
      console.log(`Formatting phone for customer ${customer.id}: ${phone} -> ${formattedPhone}`);
      
      const graphqlId = `gid://shopify/Customer/${customer.id}`;
      
      const result = await updateCustomerPhone(graphqlId, formattedPhone);
      
      if (result.data?.customerUpdate?.userErrors?.length > 0) {
        console.error('Shopify errors:', result.data.customerUpdate.userErrors);
        return res.status(200).json({ 
          message: 'Update attempted with errors', 
          errors: result.data.customerUpdate.userErrors 
        });
      }
      
      console.log(`Successfully updated customer ${customer.id}`);
      return res.status(200).json({ 
        message: 'Phone number updated successfully', 
        phone: formattedPhone 
      });
    } else {
      console.log(`Phone number for customer ${customer.id} is already correct or not Egyptian: ${phone}`);
      return res.status(200).json({ message: 'No update needed' });
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
