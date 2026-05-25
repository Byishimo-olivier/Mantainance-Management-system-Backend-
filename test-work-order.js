const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function testWorkOrderCreation() {
  try {
    const fd = new FormData();
    
    // Minimal required fields based on schema
    fd.append('title', 'Test Work Order');
    fd.append('description', 'Test Description');
    fd.append('location', 'Test Location');
    fd.append('name', 'Test Name');
    fd.append('email', 'test@example.com');
    fd.append('phone', '1234567890');
    
    console.log('Sending test work order with FormData:', {
      title: 'Test Work Order',
      description: 'Test Description',
      location: 'Test Location',
      name: 'Test Name',
      email: 'test@example.com',
      phone: '1234567890',
    });

    const response = await axios.post('http://localhost:7000/api/issues', fd, {
      headers: fd.getHeaders(),
      timeout: 10000,
    });

    console.log('SUCCESS - Work order created:', response.data);
  } catch (error) {
    console.error('FAILED - Error creating work order:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      config: {
        url: error.config?.url,
        method: error.config?.method,
      },
    });
  }
}

testWorkOrderCreation();
