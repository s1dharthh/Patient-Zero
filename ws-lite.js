// Minimal RFC 6455 WebSocket server for this MVP. Supports masked client frames,
// text messages, close, ping/pong and extended payload lengths.
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
class Peer extends EventEmitter {
  constructor(socket) { super(); this.socket=socket; this.readyState=1; this.buffer=Buffer.alloc(0); socket.on('data',d=>this._data(d)); socket.on('close',()=>{if(this.readyState!==3){this.readyState=3;this.emit('close');}}); socket.on('error',()=>{if(this.readyState!==3){this.readyState=3;this.emit('close');}}); }
  send(data) { if(this.readyState!==1)return;const payload=Buffer.from(String(data));let header;if(payload.length<126){header=Buffer.alloc(2);header[1]=payload.length;}else if(payload.length<=65535){header=Buffer.alloc(4);header[1]=126;header.writeUInt16BE(payload.length,2);}else{header=Buffer.alloc(10);header[1]=127;header.writeBigUInt64BE(BigInt(payload.length),2);}header[0]=0x81;this.socket.write(Buffer.concat([header,payload])); }
  close(){if(this.readyState!==1)return;this.readyState=2;this.socket.end(Buffer.from([0x88,0x00]));this.readyState=3;}
  _data(data){this.buffer=Buffer.concat([this.buffer,data]);while(this.buffer.length>=2){const b0=this.buffer[0],b1=this.buffer[1],op=b0&15,masked=!!(b1&128);let len=b1&127,off=2;if(len===126){if(this.buffer.length<4)return;len=this.buffer.readUInt16BE(2);off=4;}else if(len===127){if(this.buffer.length<10)return;const big=this.buffer.readBigUInt64BE(2);if(big>BigInt(8*1024*1024)){this.close();return;}len=Number(big);off=10;}let mask;if(masked){if(this.buffer.length<off+4)return;mask=this.buffer.subarray(off,off+4);off+=4;}if(this.buffer.length<off+len)return;const payload=Buffer.from(this.buffer.subarray(off,off+len));this.buffer=this.buffer.subarray(off+len);if(masked)for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];if(op===8){this.close();this.emit('close');return;}if(op===9){this._control(10,payload);continue;}if(op===10)continue;if(op===1)this.emit('message',payload);}}
  _control(op,payload){const h=Buffer.from([0x80|op,payload.length]);this.socket.write(Buffer.concat([h,payload]));}
}
class WebSocketServer extends EventEmitter {
  constructor({server}){super();this.clients=new Set();server.on('upgrade',(req,socket)=>{const key=req.headers['sec-websocket-key'];if(!key||req.headers.upgrade?.toLowerCase()!=='websocket'){socket.destroy();return;}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');const peer=new Peer(socket);this.clients.add(peer);peer.on('close',()=>this.clients.delete(peer));this.emit('connection',peer,req);});}
}
module.exports={WebSocketServer};
