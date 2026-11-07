const p = { host: '1.2.3.4', port: 1080, builtin: false };
const s = `
  <tr>
    <td>${p.host}${p.builtin ? '' : `<button onclick="removeProxy('${p.host}', ${p.port})">X</button>`}</td>
  </tr>
`;
console.log(s);
