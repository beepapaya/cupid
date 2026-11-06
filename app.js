const FIREBASE_URL = 'https://cupid-2fde6-default-rtdb.firebaseio.com/couple_users.json';
const EXPIRATION_TIME_MS = 24 * 60 * 60 * 1000; // 24時間 (ミリ秒)

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
let pollInterval = null;

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

function getFriendlyErrorMessage(error) {
    if (error && error.message) {
        if (error.message.includes('Permission denied') || error.message.toLowerCase().includes('permission')) {
            return 'データベースのアクセス権限エラーです。FirebaseのRealtime Databaseで「ルール」タブを開き、読み書きが許可されている（".read": true, ".write": true）か確認してください。';
        }
    }
    return 'エラーが発生しました。時間を置いて再度お試しください。';
}

// 24時間以上経過したデータを消去・フィルタリングする
function purgeExpiredUsers(users) {
    const now = Date.now();
    let hasExpired = false;
    const activeUsers = {};

    for (const id in users) {
        const user = users[id];
        if (!user) continue;
        // 登録日時、または指名日時などのタイムスタンプを確認
        const userTimestamp = user.createdAt || (user.nominated && user.nominated.timestamp) || 0;
        
        // 24時間以内のデータのみ残す
        if (now - userTimestamp < EXPIRATION_TIME_MS) {
            activeUsers[id] = user;
        } else {
            hasExpired = true;
        }
    }

    return { activeUsers, hasExpired };
}

// ユーザー一覧を取得する（非同期）
async function getUsers() {
    let users = {};
    try {
        const response = await fetch(FIREBASE_URL);
        if (response.ok) {
            const data = await response.json();
            if (data !== null) {
                users = data;
            } else {
                users = JSON.parse(localStorage.getItem('couple_users') || '{}');
            }
        } else {
            users = JSON.parse(localStorage.getItem('couple_users') || '{}');
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        users = JSON.parse(localStorage.getItem('couple_users') || '{}');
    }

    // 24時間経過したデータを消去更新
    const { activeUsers, hasExpired } = purgeExpiredUsers(users);
    if (hasExpired) {
        // FirebaseおよびlocalStorageの古いデータを消去更新する
        saveUsers(activeUsers).catch(err => console.error('Error updating expired users:', err));
    }

    return activeUsers;
}

// ユーザー一覧を保存する（非同期）
async function saveUsers(users) {
    localStorage.setItem('couple_users', JSON.stringify(users)); // ローカルにもバックアップとして保存
    
    try {
        const response = await fetch(FIREBASE_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error ${response.status}`);
        }
    } catch (error) {
        console.error('Error saving users:', error);
        throw error;
    }
}

async function init() {
    const loggedInId = localStorage.getItem('currentUserId');
    if (loggedInId) {
        const users = await getUsers();
        if (users[loggedInId]) {
            currentUserId = loggedInId;
            currentUser = users[loggedInId];
            showMainScreen();
            return;
        } else {
            // 24時間経過等で消去されていた場合
            localStorage.removeItem('currentUserId');
        }
    }
    showAuthScreen();
}

function showAuthScreen() {
    authScreen.classList.add('active');
    mainScreen.classList.remove('active');
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
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
    
    // 他のユーザーの変更や24時間経過による消去を検知するために定期的にステータスを更新する
    if (!pollInterval) {
        pollInterval = setInterval(updateStatus, 10000); // 10秒ごと
    }
}

function handleLogout() {
    localStorage.removeItem('currentUserId');
    currentUser = null;
    currentUserId = null;
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    showAuthScreen();
}

logoutBtn.addEventListener('click', handleLogout);

async function updateStatus() {
    if (!currentUserId) return;

    const users = await getUsers();
    
    // 24時間経過して自分が消去されていた場合
    if (!users[currentUserId]) {
        alert('24時間が経過したため、データが自動リセットされました。');
        handleLogout();
        return;
    }

    currentUser = users[currentUserId];
    const nominated = currentUser.nominated;

    if (!nominated) {
        statusBox.className = 'status-box';
        statusBox.innerHTML = '<p>意中のお相手を指名しましょう！<br><small>※相手に指名されるとマッチングします</small></p>';
        return;
    }

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

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    
    const submitBtn = authForm.querySelector('button');
    submitBtn.disabled = true;

    try {
        const lastName = document.getElementById('last-name').value.trim();
        const firstName = document.getElementById('first-name').value.trim();
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
        const users = await getUsers();
        
        // 同じ正規化名を持つ既存ユーザーを検索
        const sameNameUsers = [];
        for (let id in users) {
            if (users[id].normalizedName === normalizedInputName) {
                sameNameUsers.push({ id, ...users[id] });
            }
        }

        if (sameNameUsers.length === 0) {
            // 同姓同名がいない新規登録
            const userId = generateUserId(name, additionalInfo);
            const newUser = {
                name,
                normalizedName: normalizedInputName,
                additionalInfo,
                nominated: null,
                createdAt: Date.now()
            };
            users[userId] = newUser;
            await saveUsers(users);
            
            currentUser = newUser;
            currentUserId = userId;
            localStorage.setItem('currentUserId', userId);
            showMainScreen();
        } else if (sameNameUsers.length === 1 && !sameNameUsers[0].additionalInfo && !additionalInfo) {
            // 同姓同名が1人のみ存在し、追加情報もない場合 -> そのユーザーとして再開/ログイン
            currentUser = sameNameUsers[0];
            currentUserId = sameNameUsers[0].id;
            localStorage.setItem('currentUserId', currentUserId);
            showMainScreen();
        } else {
            // 同姓同名が既にいる、または追加情報が必要な場合
            if (!additionalInfo) {
                additionalInfoGroup.style.display = 'block';
                authError.textContent = '同じ名前の方が既にいます。追加情報（クラスや学校名など）を入力してください。';
                submitBtn.disabled = false;
                return;
            }

            const userId = generateUserId(name, additionalInfo);
            if (users[userId]) {
                // 同じ追加情報の既存ユーザーとしてログイン
                currentUser = users[userId];
                currentUserId = userId;
                localStorage.setItem('currentUserId', userId);
                showMainScreen();
            } else {
                // 追加情報を持った新規登録
                const newUser = {
                    name,
                    normalizedName: normalizedInputName,
                    additionalInfo,
                    nominated: null,
                    createdAt: Date.now()
                };
                users[userId] = newUser;
                await saveUsers(users);
                
                currentUser = newUser;
                currentUserId = userId;
                localStorage.setItem('currentUserId', userId);
                showMainScreen();
            }
        }
    } catch (error) {
        console.error(error);
        authError.textContent = getFriendlyErrorMessage(error);
    }
    
    submitBtn.disabled = false;
});

nominateForm.addEventListener('submit', async (e) => {
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

        // 一週間に一度の制限は廃止

        const users = await getUsers();
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
            await processNomination(candidates[0].id, partnerName);
        } else {
            await processNomination(null, partnerName);
        }

        async function processNomination(targetId, targetName) {
            try {
                users[currentUserId].nominated = {
                    name: targetName,
                    targetId: targetId,
                    timestamp: Date.now()
                };
                await saveUsers(users);
                
                currentUser = users[currentUserId];
                await updateStatus();
                nominateError.textContent = '';
                
                submitBtn.textContent = '思い人を登録しました！';
                submitBtn.style.backgroundColor = '#2ed573';
                submitBtn.style.color = 'white';
                setTimeout(() => {
                    submitBtn.textContent = '思い人変更';
                    submitBtn.style.backgroundColor = '';
                    submitBtn.style.color = '';
                }, 2000);
                submitBtn.disabled = false;
            } catch (error) {
                console.error(error);
                nominateError.textContent = getFriendlyErrorMessage(error);
                submitBtn.disabled = false;
            }
        }
        
    } catch (error) {
        console.error(error);
        nominateError.textContent = getFriendlyErrorMessage(error);
        submitBtn.disabled = false;
    }
});

init();
