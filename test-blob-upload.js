// test-blob-upload.js
const { put } = require('@vercel/blob');
const fs = require('fs');

async function testUpload() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    console.log('Token exists:', !!token);
    console.log('Token length:', token?.length);

    // 创建测试文件内容
    const testContent = `solid test
  facet normal 0 0 0
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`;

    const blob = await put('stl-models/test-direct.stl', testContent, {
      access: 'public',
      token: token,
    });

    console.log('Upload successful!');
    console.log('URL:', blob.url);
  } catch (error) {
    console.error('Upload failed:', error.message);
    console.error('Full error:', error);
  }
}

testUpload();
