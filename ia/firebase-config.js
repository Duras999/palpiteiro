// Configuração do Firebase do Palpiteiro.
// Esses dados são públicos por natureza; quem protege os dados são as regras do Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyCqPLDG9aj92SE__wvQnNTQ4FvFizdnUZM",
  authDomain: "palpiteiro-7b202.firebaseapp.com",
  projectId: "palpiteiro-7b202",
  storageBucket: "palpiteiro-7b202.firebasestorage.app",
  messagingSenderId: "547352351575",
  appId: "1:547352351575:web:b84e97bc55511ca2112412"
};

// E-mails dos 2 administradores (os mesmos que você colocar nas regras do Firestore).
export const ADMINS = ["jorgeluizsilvasiqueira@gmail.com"];

export const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

// Chave pública das notificações (gerada no Firebase, em Cloud Messaging).
// É pública de propósito: vai dentro do app para o celular se inscrever.
export const VAPID = "BL_RaPtnrghVeUEv1Dckka4VDZw6mAGdaVS9o4GZFDeQLseMv8577a0iSKqf8SKVHa2t_CZwhe7zfPrRP4RtfBE";
