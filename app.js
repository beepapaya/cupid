// Firebaseライブラリの読み込み
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// あなたのFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyCa_bbbSS12SuMZD1b2BK673q59129b6rs",
  authDomain: "cupid-2fde6.firebaseapp.com",
  projectId: "cupid-2fde6",
  storageBucket: "cupid-2fde6.firebasestorage.app",
  messagingSenderId: "556101305124",
  appId: "1:556101305124:web:f8b91752c4391efb15a9b1",
  measurementId: "G-8N2Z5EWY9C"
};

// 初期化
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app); // 💡今後、データの保存や取得にはこの「db」を使います

// --- 💡ここから下に、もともとの app.js の中身（ボタンのクリックイベントやマッチングのロジックなど）を続けて書いていきます ---
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const displayName = document.getElementById('display-name');
const logoutBtn = document.getElementById('logout-btn');
const nominateForm = document.getElementById('nominate-form');
const nominateError = document.getElementById('nominate-error');
const statusBox = document.getElementById('status-box');
const partnerLastNameInput = document.getElementById('partner-last-name');
const partnerFirstNameInput = document.getElementById('partner-first-name');

let currentUser = null;
let currentUserId = null;

function generateUserId(name, additionalInfo = '') {
    return btoa(encodeURIComponent(`${normalizeName(name)}_${additionalInfo}`));
}

function normalizeName(name) {
    if (!name) return '';
    return name.replace(/[\u30a1-\u30f6]/g, function(match) {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    }).replace(/\s+/g, '');
}

function isValidKana(str) {
    return /^[ぁ-んァ-ヶー]+$/.test(str);
}

function getUsers() {
    return JSON.parse(localStorage.getItem('couple_users') || '{}');
}

function saveUsers(users) {
    localStorage.setItem('couple_users', JSON.stringify(users));
}

function init() {
    const loggedInId = localStorage.getItem('currentUserId');
    if (loggedInId) {
        const users = getUsers();
        if (users[loggedInId]) {
            currentUserId = loggedInId;
            currentUser = users[loggedInId];
            showMainScreen();
            return;
        }
    }
    showAuthScreen();
}

function showAuthScreen() {
    authScreen.classList.add('active');
    mainScreen.classList.remove('active');
    window.removeEventListener('storage', onStorageChange);
}

function showMainScreen() {
    authScreen.classList.remove('active');
    mainScreen.classList.add('active');
    displayName.textContent = currentUser.name;
    
    const btn = nominateForm.querySelector('button');
    if (currentUser.nominated) {
        const [last, first] = currentUser.nominated.name.split(' ');
        partnerLastNameInput.value = last || '';
        partnerFirstNameInput.value = first || '';
        btn.textContent = '思い人変更';
    } else {
        partnerLastNameInput.value = '';
        partnerFirstNameInput.value = '';
        btn.textContent = 'この人を指名する！';
    }

    updateStatus();
    window.addEventListener('storage', onStorageChange);
}

function onStorageChange(e) {
    if (e.key === 'couple_users') {
        const users = JSON.parse(e.newValue || '{}');
        if (currentUserId && users[currentUserId]) {
            currentUser = users[currentUserId];
            updateStatus();
        }
    }
}

function updateStatus() {
    const nominated = currentUser.nominated;

    if (!nominated) {
        statusBox.className = 'status-box';
        statusBox.innerHTML = '<p>意中のお相手を指名しましょう！<br><small>※相手に指名されるとマッチングします</small></p>';
        return;
    }

    const users = getUsers();
    
    let isMatched = false;
    for (let id in users) {
        const partnerData = users[id];
        if (partnerData.nominated) {
            const partnerNominatedId = partnerData.nominated.targetId;
            const partnerNominatedName = partnerData.nominated.name;
            
            let pointsToMe = false;
            if (partnerNominatedId) {
                pointsToMe = (partnerNominatedId === currentUserId);
            } else {
                pointsToMe = (normalizeName(partnerNominatedName) === normalizeName(currentUser.name));
            }

            if (pointsToMe) {
                let iPointToPartner = false;
                if (nominated.targetId) {
                    iPointToPartner = (nominated.targetId === id);
                } else {
                    iPointToPartner = (normalizeName(nominated.name) === partnerData.normalizedName);
                }

                if (iPointToPartner) {
                    isMatched = true;
                    break;
                }
            }
        }
    }

    if (isMatched) {
        statusBox.className = 'status-box matched';
        statusBox.innerHTML = `<h3>🎉 カップル成立！ 🎉</h3><p>${nominated.name} さんと両想いです！</p>`;
    } else {
        statusBox.className = 'status-box';
        statusBox.innerHTML = `<p>💘 ${nominated.name} さんを指名中...</p><small>相手からの指名を待っています</small>`;
    }
}

authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    authError.textContent = '';
    
    const submitBtn = authForm.querySelector('button');
    submitBtn.disabled = true;

    try {
        const lastName = document.getElementById('last-name').value.trim();
        const firstName = document.getElementById('first-name').value.trim();
        const password = document.getElementById('password').value;
        const additionalInfoInput = document.getElementById('additional-info');
        const additionalInfo = additionalInfoInput.value.trim();
        const additionalInfoGroup = document.getElementById('additional-info-group');

        if (!isValidKana(lastName) || !isValidKana(firstName)) {
            authError.textContent = '名前はひらがな・カタカナのみで入力してください。';
            submitBtn.disabled = false;
            return;
        }

        const name = `${lastName} ${firstName}`;
        const normalizedInputName = normalizeName(name);
        const users = getUsers();
        
        let foundSameNameUser = null;
        for (let id in users) {
            if (users[id].normalizedName === normalizedInputName) {
                if (users[id].password === password) {
                    foundSameNameUser = users[id];
                    break;
                }
            }
        }

        const registeredUserId = localStorage.getItem('registeredUserId');

        if (foundSameNameUser) {
            const loginUserId = generateUserId(foundSameNameUser.name, foundSameNameUser.additionalInfo);
            if (registeredUserId && registeredUserId !== loginUserId) {
                authError.textContent = 'この端末からはすでに別のアカウントが登録されています。1端末につき1名のみ利用可能です。';
                submitBtn.disabled = false;
                return;
            }
            currentUser = foundSameNameUser;
            currentUserId = loginUserId;
            localStorage.setItem('currentUserId', currentUserId);
            showMainScreen();
        } else {
            let hasSameName = false;
            for (let id in users) {
                if (users[id].normalizedName === normalizedInputName) {
                    hasSameName = true;
                    break;
                }
            }

            if (hasSameName && !additionalInfo) {
                additionalInfoGroup.style.display = 'block';
                authError.textContent = '同じ名前の方が既にいます。追加情報を入力してください。';
                submitBtn.disabled = false;
                return;
            }

            const userId = generateUserId(name, additionalInfo);
            
            if (registeredUserId && registeredUserId !== userId) {
                authError.textContent = 'この端末からはすでに別のアカウントが登録されています。1端末につき1名のみ利用可能です。';
                submitBtn.disabled = false;
                return;
            }

            if (users[userId]) {
                authError.textContent = 'その追加情報を持つ同姓同名の方が既にいます。別の情報を入力してください。';
                submitBtn.disabled = false;
                return;
            }

            const newUser = {
                name,
                normalizedName: normalizedInputName,
                additionalInfo,
                password,
                nominated: null,
                createdAt: Date.now()
            };
            users[userId] = newUser;
            saveUsers(users);
            
            currentUser = newUser;
            currentUserId = userId;
            localStorage.setItem('currentUserId', userId);
            localStorage.setItem('registeredUserId', userId);
            showMainScreen();
        }
    } catch (error) {
        console.error(error);
        authError.textContent = 'エラーが発生しました。';
    }
    
    submitBtn.disabled = false;
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('currentUserId');
    currentUser = null;
    currentUserId = null;
    showAuthScreen();
});

nominateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    nominateError.textContent = '';
    
    const submitBtn = nominateForm.querySelector('button');
    submitBtn.disabled = true;

    try {
        const partnerLastName = partnerLastNameInput.value.trim();
        const partnerFirstName = partnerFirstNameInput.value.trim();

        if (!isValidKana(partnerLastName) || !isValidKana(partnerFirstName)) {
            nominateError.textContent = '想い人の名前はひらがな・カタカナのみで入力してください。';
            submitBtn.disabled = false;
            return;
        }

        const partnerName = `${partnerLastName} ${partnerFirstName}`;

        if (normalizeName(partnerName) === normalizeName(currentUser.name)) {
            nominateError.textContent = '自分自身を指名することはできません。';
            submitBtn.disabled = false;
            return;
        }

        if (currentUser.nominated && normalizeName(currentUser.nominated.name) === normalizeName(partnerName)) {
            nominateError.textContent = 'すでにそのお相手を想っています。';
            submitBtn.disabled = false;
            return;
        }

        if (currentUser.nominated && currentUser.nominated.timestamp) {
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const elapsed = Date.now() - currentUser.nominated.timestamp;
            if (elapsed < ONE_WEEK) {
                const remainingDays = Math.ceil((ONE_WEEK - elapsed) / (1000 * 60 * 60 * 24));
                nominateError.textContent = `お相手を変更できるのは一週間に一度だけです（あと約${remainingDays}日）。`;
                submitBtn.disabled = false;
                return;
            }
        }

        const users = getUsers();
        const candidates = [];
        for (let id in users) {
            if (users[id].normalizedName === normalizeName(partnerName)) {
                candidates.push({ id, ...users[id] });
            }
        }

        if (candidates.length > 1) {
            const selectionModal = document.getElementById('selection-modal');
            const selectionList = document.getElementById('selection-list');
            selectionList.innerHTML = '';
            
            candidates.forEach(candidate => {
                const item = document.createElement('div');
                item.className = 'selection-item';
                item.innerHTML = `
                    <strong>${candidate.name}</strong>
                    <small>${candidate.additionalInfo || '追加情報なし'}</small>
                `;
                item.onclick = () => {
                    selectionModal.classList.remove('active');
                    processNomination(candidate.id, candidate.name);
                };
                selectionList.appendChild(item);
            });

            selectionModal.classList.add('active');
            
            const cancelBtn = document.getElementById('cancel-selection-btn');
            cancelBtn.onclick = () => {
                selectionModal.classList.remove('active');
                submitBtn.disabled = false;
            };
            return;
        } else if (candidates.length === 1) {
            processNomination(candidates[0].id, partnerName);
        } else {
            processNomination(null, partnerName);
        }

        function processNomination(targetId, targetName) {
            users[currentUserId].nominated = {
                name: targetName,
                targetId: targetId,
                timestamp: Date.now()
            };
            saveUsers(users);
            
            currentUser = users[currentUserId];
            updateStatus();
            nominateError.textContent = '';
            
            submitBtn.textContent = '変更は一週間に一度';
            submitBtn.style.backgroundColor = '#2ed573';
            submitBtn.style.color = 'white';
            setTimeout(() => {
                submitBtn.textContent = '思い人変更';
                submitBtn.style.backgroundColor = '';
                submitBtn.style.color = '';
            }, 2000);
            submitBtn.disabled = false;
        }
        
    } catch (error) {
        console.error(error);
        nominateError.textContent = 'エラーが発生しました。';
        submitBtn.disabled = false;
    }
});

init();
