export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ============================================================
     * 基础配置
     * ============================================================
     */

    const SYNAPSE_URL =
      env.SYNAPSE_URL.replace(/\/$/, "");

    const ADMIN_TOKEN =
      env.ADMIN_TOKEN;  

    const headers = {
      "content-type":
        "text/html; charset=UTF-8",
    };


    /*
     * ============================================================
     * 工具函数
     * ============================================================
     */

    function json(data, status = 200) {

      return new Response(
        JSON.stringify(data),
        {
          status,
          headers: {
            "content-type":
              "application/json; charset=UTF-8",
          },
        }
      );

    }


    function randomCode() {

      return Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

    }


    function normalizeUsername(username) {

      return username
        .trim()
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/:.*$/, "");

    }


    function normalizeInvite(invite) {

      return invite
        .trim()
        .toUpperCase();

    }


    function userId(username) {

      return `@${normalizeUsername(username)}:chat.wuorz.com`;

    }


    function validUsername(username) {

      return /^[a-z0-9._=-]{1,50}$/.test(
        username
      );

    }


    function validEmail(email) {

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      );

    }


function parseUserAgent(ua){

  let browser = "未知浏览器";

  let os = "未知系统";


  /*
   * 浏览器
   */

  if(/Edg\//.test(ua)){

    browser = "Edge";

  }
  else if(/Chrome\//.test(ua)){

    browser = "Chrome";

  }
  else if(/Firefox\//.test(ua)){

    browser = "Firefox";

  }
  else if(/Safari\//.test(ua)){

    browser = "Safari";

  }


  /*
   * 系统
   */

  if(/Macintosh/.test(ua)){

    os = "macOS";

  }
  else if(/iPhone/.test(ua)){

    os = "iPhone";

  }
  else if(/iPad/.test(ua)){

    os = "iPadOS";

  }
  else if(/Windows/.test(ua)){

    os = "Windows";

  }
  else if(/Android/.test(ua)){

    os = "Android";

  }
  else if(/Linux/.test(ua)){

    os = "Linux";

  }


  return `${browser} · ${os}`;

}    


/*
 * ============================================================
 * 检查用户名 / 邮箱是否已经注册
 * ============================================================
 */

async function checkRegistrationAvailability(
  username,
  email
) {

  const result = {
    usernameExists: false,
    emailExists: false
  };


  /*
   * ----------------------------------------------------------
   * 检查用户名
   * ----------------------------------------------------------
   */

if (username) {

  const uid =
    userId(username);


  const response =
    await fetch(
      `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(uid)}`,
      {
        headers: {
          "Authorization":
            `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`
        }
      }
    );


  /*
   * 200 = 用户存在
   * 404 = 用户不存在
   */

  if (response.status === 200) {

    result.usernameExists = true;

  } else if (response.status === 404) {

    result.usernameExists = false;

  } else {

    const text =
      await response.text();

    console.error(
      "Username existence check failed:",
      response.status,
      text
    );

    throw new Error(
      "无法检查用户名是否已注册"
    );

  }

}


  /*
   * ----------------------------------------------------------
   * 检查邮箱
   * ----------------------------------------------------------
   */

  if (email) {

    const response =
      await fetch(
        `${SYNAPSE_URL}/_synapse/admin/v1/threepid/email/users/${encodeURIComponent(email)}`,
        {
          headers: {
            "Authorization":
              `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`
          }
        }
      );


    /*
     * 200 = 找到了用户
     * 404 = 没有用户
     */

    if (response.status === 200) {

      result.emailExists = true;

    } else if (response.status !== 404) {

      const text =
        await response.text();

      console.error(
        "Email availability check failed:",
        response.status,
        text
      );

      throw new Error(
        "无法检查邮箱是否已注册"
      );

    }

  }


  return result;

}    


    async function hashPassword(password) {

      const data =
        new TextEncoder().encode(password);

      const hash =
        await crypto.subtle.digest(
          "SHA-256",
          data
        );

      return Array.from(
        new Uint8Array(hash)
      )
        .map(
          x =>
            x.toString(16)
              .padStart(2, "0")
        )
        .join("");

    }


    /*
     * ============================================================
     * Resend
     * ============================================================
     */

    async function sendEmail(
      to,
      subject,
      html
    ) {

      const response =
        await fetch(
          "https://api.resend.com/emails",
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${env.RESEND_API_KEY}`,

              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              from:
                "WUORZ Chat <chat-admin@wuorz.com>",

              to: [to],

              subject,

              html,

            }),
          }
        );


      if (!response.ok) {

        const text =
          await response.text();

        console.error(
          "Resend error:",
          text
        );

        throw new Error(
          "邮件发送失败"
        );

      }

      return true;

    }


    /*
     * ============================================================
     * 验证码
     * ============================================================
     */

    async function sendCode(
      email,
      type
    ) {

      email =
        email
          .trim()
          .toLowerCase();


      if (!validEmail(email)) {

        return {
          ok: false,
          error:
            "请输入正确的邮箱地址",
        };

      }


      const key =
        `code:${type}:${email}`;


      const cooldownKey =
        `cooldown:${type}:${email}`;


      const exists =
        await env.CHATID_KV.get(
          cooldownKey
        );


      if (exists) {

        return {
          ok: false,
          error:
            "请稍后再获取验证码",
        };

      }


      const code =
        randomCode();


      const hash =
        await hashPassword(code);


      await env.CHATID_KV.put(
        key,
        hash,
        {
          expirationTtl: 300,
        }
      );


      await env.CHATID_KV.put(
        cooldownKey,
        "1",
        {
          expirationTtl: 60,
        }
      );


const subject =
  type === "register"
    ? "WUORZ Chat 注册验证码"
    :
  type === "change-email"
    ? "WUORZ Chat 邮箱换绑验证码"
    :
    "WUORZ Chat 密码重置验证码";


const title =
  type === "register"
    ? "注册验证码"
    :
  type === "change-email"
    ? "邮箱换绑验证码"
    :
    "密码重置验证码";


      await sendEmail(
        email,
        subject,
        `
<!doctype html>

<html>

<body style="
  font-family:-apple-system,
  BlinkMacSystemFont,
  'Helvetica Neue',
  Arial,
  sans-serif;
  color:#1d1d1f;
">

<h2>${title}</h2>

<p>你的验证码是：</p>

<div style="
  font-size:32px;
  font-weight:700;
  letter-spacing:8px;
  margin:24px 0;
">
${code}
</div>

<p>
验证码 5 分钟内有效。
</p>

<p style="color:#86868b">
如果不是你本人操作，请忽略此邮件。
</p>

</body>

</html>
`
      );


      return {
        ok: true,
      };

    }


    async function verifyCode(
      email,
      code,
      type
    ) {

      email =
        email
          .trim()
          .toLowerCase();


      const key =
        `code:${type}:${email}`;


      const stored =
        await env.CHATID_KV.get(
          key
        );


      if (!stored) {

        return false;

      }


      const hash =
        await hashPassword(code);


      if (hash !== stored) {

        return false;

      }


      await env.CHATID_KV.delete(
        key
      );


      return true;

    }


    /*
 * ============================================================
 * 管理员 Session
 * ============================================================
 */

const ADMIN_SESSION_TTL = 60 * 60;


/*
 * 生成随机管理员 Session
 */

async function createAdminSession(env) {

  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);


  const session =
    Array.from(bytes)
      .map(
        b =>
          b
            .toString(16)
            .padStart(2, "0")
      )
      .join("");


  await env.CHATID_KV.put(
    `admin_session:${session}`,
    "1",
    {
      expirationTtl:
        ADMIN_SESSION_TTL
    }
  );


  return session;

}


/*
 * 获取 Cookie
 */

function getCookie(
  request,
  name
) {

  const cookie =
    request.headers.get(
      "Cookie"
    ) || "";


  const match =
    cookie
      .split(";")
      .map(
        x => x.trim()
      )
      .find(
        x =>
          x.startsWith(
            name + "="
          )
      );


  if(!match){

    return "";

  }


  return decodeURIComponent(
    match.substring(
      name.length + 1
    )
  );

}


/*
 * 验证管理员 Session
 */

async function verifyAdminSession(
  request,
  env
) {

  const session =
    getCookie(
      request,
      "wuorz_admin_session"
    );


  if(!session){

    return false;

  }


  const exists =
    await env.CHATID_KV.get(
      `admin_session:${session}`
    );


  return !!exists;

}


/*
 * 删除管理员 Session
 */

async function deleteAdminSession(
  request,
  env
) {

  const session =
    getCookie(
      request,
      "wuorz_admin_session"
    );


  if(!session){

    return;

  }


  await env.CHATID_KV.delete(
    `admin_session:${session}`
  );

}


    /*
     * ============================================================
     * 首页
     * ============================================================
     */

    if (url.pathname === "/") {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 账户管理</title>

<style>

*{
  box-sizing:border-box
}

body{

  margin:0;

  min-height:100vh;

  display:flex;

  align-items:center;

  justify-content:center;

  background:#f5f5f7;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "Helvetica Neue",
    Arial,
    sans-serif;

  color:#1d1d1f;
}

.card{

  width:min(
    390px,
    calc(100% - 32px)
  );

  background:white;

  border-radius:20px;

  padding:36px 32px;

  box-shadow:
    0 8px 40px rgba(0,0,0,.08);
}

.logo{

  font-size:28px;

  font-weight:700;

  letter-spacing:-.8px;
}

.subtitle{

  margin-top:8px;

  color:#86868b;

  font-size:15px;
}

.actions{

  margin-top:32px;

  display:grid;

  gap:12px;
}

button{

  width:100%;

  height:46px;

  border:0;

  border-radius:12px;

  font-size:16px;

  cursor:pointer;
}

.primary{

  background:#1d1d1f;

  color:white;
}

.secondary{

  background:#f2f2f7;

  color:#1d1d1f;
}

.footer{

  margin-top:28px;

  text-align:center;

  color:#86868b;

  font-size:13px;
}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
管理你的聊天账户
</div>

<div class="actions">

<button
class="primary"
onclick="location.href='/login'"
>
登录
</button>

<button
class="secondary"
onclick="location.href='/register'"
>
创建账号
</button>

</div>

<div class="footer">
Powered by WUORZ
</div>

</div>

</body>

</html>`,
        {
          headers,
        }
      );

    }


    /*
     * ============================================================
     * 登录页面
     * ============================================================
     */

    if (url.pathname === "/login") {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 登录</title>

<style>

${COMMON_CSS}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
登录你的账户
</div>

<form id="form">

<label>用户名</label>

<input
id="username"
autocomplete="username"
placeholder="用户名"
required
>

<label>密码</label>

<input
id="password"
type="password"
autocomplete="current-password"
placeholder="密码"
required
>

<button>
登录
</button>

<div
class="error"
id="error"
></div>

</form>

<div class="links">

<a href="/forgot">
忘记密码？
</a>

&nbsp;·&nbsp;

<a href="/register">
创建账号
</a>

</div>

</div>

<script>

const params =
  new URLSearchParams(
    location.search
  );


const savedUsername =
  params.get("username");


if(savedUsername){

  document
    .getElementById("username")
    .value =
      savedUsername;

}

document
.getElementById("form")
.addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    const username =
      document
        .getElementById("username")
        .value
        .trim();

    const password =
      document
        .getElementById("password")
        .value;

    const error =
      document
        .getElementById("error");

    error.style.display =
      "none";

    try {

      const r =
        await fetch(
          "/api/login",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                username,
                password
              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "登录失败"
        );

      }


      sessionStorage.setItem(
        "chatid_access_token",
        data.access_token
      );


      sessionStorage.setItem(
        "chatid_user_id",
        data.user_id
      );


      location.href =
        "/account";


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);

</script>

</body>

</html>`,
        {
          headers,
        }
      );

    }


    /*
     * ============================================================
     * 注册页面
     * ============================================================
     */

    if (url.pathname === "/register") {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 创建账号</title>

<style>

${COMMON_CSS}

.code-row{

  display:flex;

  gap:8px;
}

.code-row input{

  flex:1;
}

.code-row button{

  width:110px;

  margin-top:0;

  font-size:14px;
}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
创建你的账户
</div>

<form id="form">

<label>用户名</label>

<input
id="username"
placeholder="仅支持小写字母和数字"
autocomplete="username"
required
>


<label>邮箱</label>

<input
id="email"
type="email"
placeholder="你的邮箱"
autocomplete="email"
required
>


<label>邀请码</label>

<input
id="invite"
placeholder="输入邀请码"
autocomplete="off"
required
>


<label>验证码</label>

<div class="code-row">

<input
id="code"
placeholder="6位验证码"
inputmode="numeric"
required
>

<button
type="button"
class="secondary"
id="send"
>
获取验证码
</button>

</div>


<label>密码</label>

<input
id="password"
type="password"
autocomplete="new-password"
required
>


<label>确认密码</label>

<input
id="password2"
type="password"
autocomplete="new-password"
required
>


<button>
创建账号
</button>


<div
class="error"
id="error"
></div>

</form>


<div class="links">

<a href="/login">
已有账号？登录
</a>

</div>

</div>


<script>

const error =
document.getElementById(
  "error"
);


document
.getElementById("send")
.addEventListener(
  "click",
  async () => {

    const email =
      document
        .getElementById("email")
        .value
        .trim();


    error.style.display =
      "none";


    try{

      const r =
        await fetch(
          "/api/register/send-code",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                email
              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "发送失败"
        );

      }


      let n = 60;


      const btn =
        document
          .getElementById(
            "send"
          );


      btn.disabled =
        true;


      const timer =
        setInterval(
          () => {

            n--;

            btn.textContent =
              n + " 秒";


            if(n <= 0){

              clearInterval(
                timer
              );

              btn.disabled =
                false;

              btn.textContent =
                "获取验证码";

            }

          },
          1000
        );


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);


document
.getElementById("form")
.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    error.style.display =
      "none";


    const username =
      document
        .getElementById("username")
        .value
        .trim();


    const email =
      document
        .getElementById("email")
        .value
        .trim();


    const invite =
      document
        .getElementById("invite")
        .value
        .trim();


    const code =
      document
        .getElementById("code")
        .value
        .trim();


    const password =
      document
        .getElementById("password")
        .value;


    const password2 =
      document
        .getElementById("password2")
        .value;


    if(password !== password2){

      error.textContent =
        "两次输入的密码不一致";

      error.style.display =
        "block";

      return;

    }


    try{

      const r =
        await fetch(
          "/api/register",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({

                username,

                email,

                invite,

                code,

                password

              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "注册失败"
        );

      }


      location.href =
        "/welcome?username=" +
        encodeURIComponent(username);


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);

</script>

</body>

</html>`,
        {
          headers,
        }
      );

    }


/*
 * ============================================================
 * 注册成功欢迎页面
 * ============================================================
 */

if (url.pathname === "/welcome") {

  const username =
    url.searchParams.get("username") || "";


  return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 欢迎</title>

<style>

${COMMON_CSS}


.welcome{

  margin-top:28px;

  text-align:center;

}


.emoji{

  font-size:42px;

  line-height:1;

}


.welcome-title{

  margin-top:20px;

  font-size:24px;

  font-weight:700;

  letter-spacing:-.5px;

}


.welcome-text{

  margin-top:10px;

  color:#86868b;

  font-size:15px;

  line-height:1.6;

}


.next{

  margin-top:30px;

  text-align:left;

}


.next-title{

  font-size:15px;

  font-weight:600;

}


.next-item{

  margin-top:12px;

  color:#555;

  font-size:14px;

  line-height:1.5;

}


.clients{

  margin-top:30px;

  text-align:left;

}


.clients-title{

  font-size:15px;

  font-weight:600;

}


.client{

  display:block;

  margin-top:10px;

  padding:14px 16px;

  border-radius:12px;

  background:#f2f2f7;

  color:#1d1d1f;

  text-decoration:none;

  transition:
    background .15s ease;

}


.client:hover{

  background:#e8e8ed;

}


.client-name{

  font-size:15px;

  font-weight:500;

}


.client-desc{

  margin-top:3px;

  color:#86868b;

  font-size:13px;

}


.login-button{

  margin-top:30px;

}


</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>


<div class="welcome">

<div class="emoji">
🎉
</div>


<div class="welcome-title">
欢迎加入 WUORZ Chat
</div>


<div class="welcome-text">
你的账号已经创建成功。
</div>


</div>


<div class="next">

<div class="next-title">
接下来你可以：
</div>


<div class="next-item">
① 登录账户管理你的个人信息
</div>


<div class="next-item">
② 下载 Element 客户端开始聊天
</div>


<div class="next-item">
③ 使用网页版访问 WUORZ Chat
</div>


</div>


<div class="clients">

<div class="clients-title">
推荐客户端
</div>


<a
class="client"
href="https://apps.apple.com/app/id1631335820"
>

<div class="client-name">
Element X iOS
</div>

<div class="client-desc">
iPhone / iPad
</div>

</a>


<a
class="client"
href="https://github.com/element-hq/element-x-android/"
>

<div class="client-name">
Element X Android
</div>

<div class="client-desc">
Android 客户端
</div>

</a>


<a
class="client"
href="https://element.wuorz.com/#/login"
>

<div class="client-name">
Element Web
</div>

<div class="client-desc">
浏览器直接访问
</div>

</a>


</div>


<button
class="login-button"
onclick="goLogin()"
>
返回登录
</button>


</div>


<script>

function goLogin(){

  const username =
    ${JSON.stringify(username)};


  location.href =
    "/login?username=" +
    encodeURIComponent(username);

}

</script>

</body>

</html>`,
    {
      headers,
    }
  );

}    


    /*
     * ============================================================
     * 忘记密码
     * ============================================================
     */

    if (url.pathname === "/forgot") {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 忘记密码</title>

<style>

${COMMON_CSS}

.code-row{

  display:flex;

  gap:8px;
}

.code-row input{

  flex:1;
}

.code-row button{

  width:110px;

  margin-top:0;

  font-size:14px;
}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
重置你的账户密码
</div>

<form id="form">

<label>邮箱</label>

<input
id="email"
type="email"
placeholder="注册时使用的邮箱"
required
>


<label>验证码</label>

<div class="code-row">

<input
id="code"
placeholder="6位验证码"
inputmode="numeric"
required
>

<button
type="button"
class="secondary"
id="send"
>
获取验证码
</button>

</div>


<label>新密码</label>

<input
id="password"
type="password"
autocomplete="new-password"
required
>


<label>确认密码</label>

<input
id="password2"
type="password"
autocomplete="new-password"
required
>


<button>
重置密码
</button>


<div
class="error"
id="error"
></div>

</form>


<div class="links">

<a href="/login">
返回登录
</a>

</div>

</div>


<script>

const error =
document.getElementById(
  "error"
);


document
.getElementById("send")
.addEventListener(
  "click",
  async () => {

    const email =
      document
        .getElementById("email")
        .value
        .trim();


    error.style.display =
      "none";


    try{

      const r =
        await fetch(
          "/api/forgot/send-code",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                email
              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "发送失败"
        );

      }


      let n = 60;


      const btn =
        document
          .getElementById(
            "send"
          );


      btn.disabled =
        true;


      const timer =
        setInterval(
          () => {

            n--;

            btn.textContent =
              n + " 秒";


            if(n <= 0){

              clearInterval(
                timer
              );

              btn.disabled =
                false;

              btn.textContent =
                "获取验证码";

            }

          },
          1000
        );


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);


document
.getElementById("form")
.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    error.style.display =
      "none";


    const email =
      document
        .getElementById("email")
        .value
        .trim();


    const code =
      document
        .getElementById("code")
        .value
        .trim();


    const password =
      document
        .getElementById("password")
        .value;


    const password2 =
      document
        .getElementById("password2")
        .value;


    if(password !== password2){

      error.textContent =
        "两次输入的密码不一致";

      error.style.display =
        "block";

      return;

    }


    try{

      const r =
        await fetch(
          "/api/forgot",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({

                email,

                code,

                password

              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "重置失败"
        );

      }


      alert(
        "密码已重置，请重新登录"
      );


      location.href =
        "/login";


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);

</script>

</body>

</html>`,
        {
          headers,
        }
      );

    }


/*
 * ============================================================
 * 管理员：邀请码管理
 * ============================================================
 */

if (
  url.pathname === "/admin" &&
  request.method === "GET"
) {

  /*
   * ----------------------------------------------------------
   * 检查管理员 Session
   * ----------------------------------------------------------
   */

  const authenticated =
    await verifyAdminSession(
      request,
      env
    );


  /*
   * ----------------------------------------------------------
   * 未登录
   *
   * 显示管理员登录页面
   * ----------------------------------------------------------
   */

  if(!authenticated){

    return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 管理</title>

<style>

${COMMON_CSS}

body{
  padding:20px;
}

input{
  margin-top:8px;
}

button{
  margin-top:20px;
}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
管理员登录
</div>


<form id="form">

<label>
管理员密钥
</label>

<input
  id="password"
  type="password"
  autocomplete="off"
  required
>


<button>
进入管理后台
</button>


<div
  class="error"
  id="error"
></div>

</form>

</div>


<script>

const form =
  document.getElementById(
    "form"
  );


const error =
  document.getElementById(
    "error"
  );


form.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    error.style.display =
      "none";


    const password =
      document
        .getElementById(
          "password"
        )
        .value;


    if(!password){

      return;

    }


    try{

      const r =
        await fetch(
          "/api/admin/login",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                password
              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "登录失败"
        );

      }


      location.href =
        "/admin";


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);

</script>

</body>

</html>`,
      {
        headers
      }
    );

  }


  /*
   * ----------------------------------------------------------
   * 管理后台
   * ----------------------------------------------------------
   */

  return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 邀请码管理</title>

<style>

${COMMON_CSS}

body{
  padding:20px;
}

.info{

  margin-top:20px;

  padding:14px;

  border-radius:12px;

  background:#f5f5f7;

  color:#555;

  font-size:14px;

  line-height:1.6;

}

textarea{

  width:100%;

  min-height:280px;

  margin-top:20px;

  padding:14px;

  border:
    1px solid #d2d2d7;

  border-radius:12px;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;

  font-size:14px;

  line-height:1.7;

  resize:vertical;

}

.actions{

  display:grid;

  gap:10px;

  margin-top:16px;
}

.actions button{

  margin-top:0;
}

.secondary{

  background:#f2f2f7;

  color:#1d1d1f;

}

.success{

  margin-top:14px;

  color:#248a3d;

  font-size:14px;

  display:none;

}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
邀请码管理
</div>


<form id="form">

<label>
生成数量
</label>

<input
  id="count"
  type="number"
  min="1"
  max="500"
  value="20"
  required
>


<button>
生成邀请码
</button>

</form>


<div
  class="info"
>
邀请码格式：

<br>

<strong>
WUORZ-7K4P-9X2M
</strong>

<br><br>

每个邀请码只能使用一次。
生成后会永久有效，
直到成功注册后自动删除。
</div>


<textarea
  id="codes"
  placeholder="生成的邀请码会显示在这里"
  readonly
></textarea>


<div class="actions">

<button
  type="button"
  class="secondary"
  id="copy"
>
复制全部
</button>


<button
  type="button"
  class="secondary"
  id="logout"
>
退出管理
</button>

</div>


<div
  class="success"
  id="success"
>
已复制到剪贴板
</div>


<div
  class="error"
  id="error"
></div>

</div>


<script>

const form =
  document.getElementById(
    "form"
  );


const codes =
  document.getElementById(
    "codes"
  );


const error =
  document.getElementById(
    "error"
  );


const success =
  document.getElementById(
    "success"
  );


/*
 * ----------------------------------------------------------
 * 生成邀请码
 * ----------------------------------------------------------
 */

form.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    error.style.display =
      "none";

    success.style.display =
      "none";


    const count =
      Number(
        document
          .getElementById(
            "count"
          )
          .value
      );


    if(
      !Number.isInteger(count) ||
      count < 1 ||
      count > 500
    ){

      error.textContent =
        "生成数量必须是 1～500";

      error.style.display =
        "block";

      return;

    }


    try{

      const r =
        await fetch(
          "/api/admin/generate-invites",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                count
              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        if(
          r.status === 401
        ){

          location.href =
            "/admin";

          return;

        }


        throw new Error(
          data.error ||
          "生成失败"
        );

      }


      codes.value =
        data.codes.join(
          "\\n"
        );


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);


/*
 * ----------------------------------------------------------
 * 复制邀请码
 * ----------------------------------------------------------
 */

document
  .getElementById(
    "copy"
  )
  .addEventListener(
    "click",
    async () => {

      if(!codes.value){

        return;

      }


      try{

        await navigator
          .clipboard
          .writeText(
            codes.value
          );


        success.style.display =
          "block";


      }catch(e){

        codes.select();


        document.execCommand(
          "copy"
        );


        success.style.display =
          "block";

      }

    }
  );


/*
 * ----------------------------------------------------------
 * 退出管理员后台
 * ----------------------------------------------------------
 */

document
  .getElementById(
    "logout"
  )
  .addEventListener(
    "click",
    async () => {

      try{

        await fetch(
          "/api/admin/logout",
          {
            method:"POST"
          }
        );

      }catch(e){

        // 即使请求失败，
        // 仍然返回登录页面

      }


      location.href =
        "/admin";

    }
  );

</script>

</body>

</html>`,
    {
      headers
    }
  );

}


    /*
     * ============================================================
     * 账户页面
     * ============================================================
     */

    if (url.pathname === "/account") {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 账户</title>

<style>

${COMMON_CSS}


.section{

  margin-top:28px;

}


.title{

  margin-top:18px;

  font-size:13px;

  color:#86868b;

}


.value{

  margin-top:6px;

  font-size:16px;

  font-weight:500;

  word-break:break-all;

}


.section > button{

  margin-top:12px;

}


.title-row{

  margin-top:18px;

  display:flex;

  align-items:center;

  justify-content:space-between;

}


.value-row{

  margin-top:6px;

  display:flex;

  align-items:center;

  gap:8px;

}


.icon-button{

  width:26px;

  height:26px;

  padding:0;

  margin:0;

  border-radius:50%;

  background:#f2f2f7;

  color:#666;

  font-size:14px;

  line-height:26px;

}


.danger{

  background:#f2f2f7;

  color:#d70015;

}


</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div
class="subtitle"
>
账户信息
</div>


<div class="section">

<div class="title">
用户名
</div>

<div
class="value"
id="user"
>
</div>


<div class="title">
昵称
</div>


<div class="value-row">

<div
class="value"
id="displayname"
>
</div>


<button
class="icon-button"
onclick="changeName()"
title="修改昵称"
>

<svg
width="14"
height="14"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round"
>
<path d="M12 20h9"/>
<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
</svg>

</button>

</div>


<div class="title">
邮箱
</div>

<div
class="value"
id="email"
>
</div>


<div class="title">
当前设备
</div>

<div
class="value"
id="device"
>
</div>


</div>



<div class="section">

<div class="subtitle">
安全设置
</div>


<button
class="secondary"
onclick="location.href='/change-email'"
>
修改邮箱
</button>


<button
class="secondary"
onclick="location.href='/change-password'"
>
修改密码
</button>


<button
class="danger"
disabled
>
删除账户
</button>


</div>


<div class="actions">


<button
class="primary"
onclick="logout()"
>
退出登录
</button>


</div>

</div>


<script>

async function loadProfile(){

  const token =
    sessionStorage.getItem(
      "chatid_access_token"
    );


  const user =
    sessionStorage.getItem(
      "chatid_user_id"
    );


  document
    .getElementById("user")
    .textContent =
      user;


const r =
  await fetch(
    "/api/profile?user_id=" +
    encodeURIComponent(user)
  );


  const data =
    await r.json();


document
.getElementById("displayname")
.textContent =
  data.displayname || "";


document
.getElementById("email")
.textContent =
  data.email || "";    


const device =
  await fetch(
    "/api/device"
  );


const deviceData =
  await device.json();


document
.getElementById("device")
.textContent =
  deviceData.device || "";  


}


async function changeName(){

  const token =
    sessionStorage.getItem(
      "chatid_access_token"
    );


  const name =
    prompt(
      "请输入新的昵称"
    );


  if(!name){
    return;
  }


  const r =
    await fetch(
      "/api/change-displayname",
      {

        method:"POST",

        headers:{
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            token,

            displayname:name

          })

      }
    );


  const data =
    await r.json();


  if(!r.ok){

    alert(
      data.error ||
      "修改失败"
    );

    return;

  }


  alert(
    "昵称修改成功"
  );


  location.reload();

}


async function checkLogin(){


  const token =
    sessionStorage.getItem(
      "chatid_access_token"
    );


  if(!token){

    location.href =
      "/login";

    return false;

  }


  try{


    const r =
      await fetch(
        "/api/whoami",
        {

          headers:{
            "Authorization":
              "Bearer " + token
          }

        }
      );


    if(!r.ok){

      throw new Error();

    }


    const data =
      await r.json();


    sessionStorage.setItem(
      "chatid_user_id",
      data.user_id
    );


    document
      .getElementById("user")
      .textContent =
        data.user_id;


    return true;


  }catch(e){


    sessionStorage.clear();


    location.href =
      "/login";


    return false;

  }


}



(async()=>{


  const ok =
    await checkLogin();


  if(ok){

    loadProfile();

  }


})();


function logout(){

  sessionStorage.removeItem(
    "chatid_access_token"
  );


  sessionStorage.removeItem(
    "chatid_user_id"
  );


  location.href =
    "/";

}

</script>

</body>

</html>`,
        {
          headers,
        }
      );

    }


/*
 * ============================================================
 * 修改邮箱
 * ============================================================
 */

if (url.pathname === "/change-email") {

return new Response(
`
<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>
WUORZ Chat · 修改邮箱
</title>


<style>

${COMMON_CSS}


.code-row{

display:flex;
gap:8px;

}


.code-row input{

flex:1;

}


.code-row button{

width:110px;
margin-top:0;
font-size:14px;

}


</style>


</head>


<body>


<div class="card">


<div class="logo">
WUORZ Chat
</div>


<div class="subtitle">
修改绑定邮箱
</div>



<form id="form">


<label>
新邮箱
</label>


<input
id="email"
type="email"
placeholder="新的邮箱地址"
required
>



<label>
验证码
</label>


<div class="code-row">


<input
id="code"
placeholder="6位验证码"
inputmode="numeric"
required
>


<button
type="button"
class="secondary"
id="send"
>
获取验证码
</button>


</div>



<button>
确认修改
</button>



<div
class="error"
id="error"
></div>



</form>



<div class="links">

<a href="/account">
返回账户
</a>

</div>


</div>



<script>


const error =
document.getElementById(
"error"
);



document
.getElementById("send")
.addEventListener(
"click",
async()=>{


const email =
document
.getElementById("email")
.value
.trim();



try{


const r =
await fetch(
"/api/change-email/send-code",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:
JSON.stringify({
email
})

}
);



const data =
await r.json();



if(!r.ok){

throw new Error(
data.error ||
"发送失败"
);

}



alert(
  "验证码已发送"
);


let n = 60;


const btn =
  document
    .getElementById(
      "send"
    );


btn.disabled =
  true;


btn.textContent =
  n + " 秒";


const timer =
  setInterval(
    () => {

      n--;

      btn.textContent =
        n + " 秒";


      if(n <= 0){

        clearInterval(
          timer
        );


        btn.disabled =
          false;


        btn.textContent =
          "获取验证码";

      }

    },
    1000
  );



}catch(e){

error.textContent =
e.message;

error.style.display =
"block";

}


});





document
.getElementById("form")
.addEventListener(
"submit",
async e=>{


e.preventDefault();



const token =
sessionStorage.getItem(
"chatid_access_token"
);



const email =
document
.getElementById("email")
.value
.trim();



const code =
document
.getElementById("code")
.value
.trim();



const r =
await fetch(
"/api/change-email",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:
JSON.stringify({

token,

email,

code

})

}
);



const data =
await r.json();



if(!r.ok){

error.textContent =
data.error ||
"修改失败";

error.style.display =
"block";

return;

}



alert(
"邮箱修改成功，请重新登录"
);



sessionStorage.clear();


location.href =
"/login";


});


</script>


</body>

</html>
`,
{
headers
}
);


}    


    /*
     * ============================================================
     * 修改密码
     * ============================================================
     */

    if (
      url.pathname ===
        "/change-password"
    ) {

      return new Response(
`<!doctype html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>WUORZ Chat · 修改密码</title>

<style>

${COMMON_CSS}

</style>

</head>

<body>

<div class="card">

<div class="logo">
WUORZ Chat
</div>

<div class="subtitle">
修改你的密码
</div>

<form id="form">

<label>当前密码</label>

<input
id="old"
type="password"
autocomplete="current-password"
required
>


<label>新密码</label>

<input
id="password"
type="password"
autocomplete="new-password"
required
>


<label>确认新密码</label>

<input
id="password2"
type="password"
autocomplete="new-password"
required
>


<button>
修改密码
</button>


<div
class="error"
id="error"
></div>

</form>


<div class="links">

<a href="/account">
返回账户
</a>

</div>

</div>


<script>

document
.getElementById("form")
.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    const error =
      document
        .getElementById(
          "error"
        );


    error.style.display =
      "none";


    const token =
      sessionStorage.getItem(
        "chatid_access_token"
      );


    if(!token){

      location.href =
        "/login";

      return;

    }


    const old =
      document
        .getElementById("old")
        .value;


    const password =
      document
        .getElementById("password")
        .value;


    const password2 =
      document
        .getElementById("password2")
        .value;


    if(password !== password2){

      error.textContent =
        "两次输入的新密码不一致";

      error.style.display =
        "block";

      return;

    }


    try{

      const r =
        await fetch(
          "/api/change-password",
          {

            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({

                token,

                old_password:
                  old,

                new_password:
                  password

              })

          }
        );


      const data =
        await r.json();


      if(!r.ok){

        throw new Error(
          data.error ||
          "修改失败"
        );

      }


      sessionStorage.clear();


      alert(
        "密码修改成功，请重新登录"
      );


      location.href =
        "/login";


    }catch(e){

      error.textContent =
        e.message;

      error.style.display =
        "block";

    }

  }
);

</script>

</body>

</html>`,
        {
          headers,
        }
      );

    }


/*
 * ============================================================
 * API：管理员登录
 * ============================================================
 */

if (
  url.pathname ===
    "/api/admin/login" &&
  request.method === "POST"
) {

  try{

    const body =
      await request.json();


    const password =
      body.password || "";


    /*
     * 验证管理员密钥
     */

    if(
      !password ||
      password !== ADMIN_TOKEN
    ){

      return json(
        {
          error:
            "管理员密钥错误"
        },
        401
      );

    }


    /*
     * 创建随机管理员 Session
     */

    const session =
      await createAdminSession(
        env
      );


    /*
     * 设置 HttpOnly Cookie
     */

    const response =
      json({
        success:true
      });


    response.headers.set(
      "Set-Cookie",
      [
        "wuorz_admin_session=" +
          encodeURIComponent(
            session
          ),

        "Path=/",

        "Max-Age=3600",

        "HttpOnly",

        "Secure",

        "SameSite=Strict"
      ].join("; ")
    );


    return response;


  }catch(e){

    console.error(
      "Admin login:",
      e
    );


    return json(
      {
        error:
          "管理员登录失败"
      },
      500
    );

  }

}


/*
 * ============================================================
 * API：管理员退出
 * ============================================================
 */

if (
  url.pathname ===
    "/api/admin/logout" &&
  request.method === "POST"
) {

  try{

    await deleteAdminSession(
      request,
      env
    );


    const response =
      json({
        success:true
      });


    response.headers.set(
      "Set-Cookie",
      [
        "wuorz_admin_session=",

        "Path=/",

        "Max-Age=0",

        "HttpOnly",

        "Secure",

        "SameSite=Strict"
      ].join("; ")
    );


    return response;


  }catch(e){

    console.error(
      "Admin logout:",
      e
    );


    return json(
      {
        error:
          "退出失败"
      },
      500
    );

  }

}


/*
 * ============================================================
 * API：批量生成邀请码
 * ============================================================
 */

if (
  url.pathname ===
    "/api/admin/generate-invites" &&
  request.method === "POST"
) {

  /*
   * ----------------------------------------------------------
   * 验证管理员 Session
   * ----------------------------------------------------------
   */

  const authenticated =
    await verifyAdminSession(
      request,
      env
    );


  if(!authenticated){

    return json(
      {
        error:
          "管理员登录已失效"
      },
      401
    );

  }


  try{

    const body =
      await request.json();


    const count =
      Number(
        body.count
      );


    if(
      !Number.isInteger(count) ||
      count < 1 ||
      count > 500
    ){

      return json(
        {
          error:
            "生成数量必须是 1～500"
        },
        400
      );

    }


    /*
     * ----------------------------------------------------------
     * 邀请码字符集
     *
     * 排除容易混淆的：
     * O / 0 / I / 1 / L
     * ----------------------------------------------------------
     */

    const chars =
      "ABCDEFGHJKMNPQRSTUVWXYZ23456789";


    function generateInviteCode(){

      const bytes =
        new Uint8Array(8);


      crypto.getRandomValues(
        bytes
      );


      let code = "";


      for(
        let i = 0;
        i < 8;
        i++
      ){

        code +=
          chars[
            bytes[i] %
            chars.length
          ];

      }


      return (
        "WUORZ-" +
        code.slice(0,4) +
        "-" +
        code.slice(4,8)
      );

    }


    const codes = [];


    /*
     * ----------------------------------------------------------
     * 生成邀请码
     *
     * 如果随机碰撞，则重新生成
     * ----------------------------------------------------------
     */

    while(
      codes.length < count
    ){

      const code =
        generateInviteCode();


      if(
        codes.includes(code)
      ){

        continue;

      }


      const key =
        `invite:${code}`;


      const exists =
        await env.CHATID_KV.get(
          key
        );


      if(exists){

        continue;

      }


      codes.push(code);

    }


    /*
     * ----------------------------------------------------------
     * 写入 KV
     * ----------------------------------------------------------
     */

    for(
      const code of codes
    ){

      await env.CHATID_KV.put(
        `invite:${code}`,
        "1"
      );

    }


    return json({

      success:true,

      count:
        codes.length,

      codes

    });


  }catch(e){

    console.error(
      "Generate invites:",
      e
    );


    return json(
      {
        error:
          "邀请码生成失败"
      },
      500
    );

  }

}    


    /*
     * ============================================================
     * API：登录
     * ============================================================
     */

    if (
      url.pathname === "/api/login" &&
      request.method === "POST"
    ) {

      try {

        const body =
          await request.json();


        const username =
          normalizeUsername(
            body.username || ""
          );


        const password =
          body.password || "";


        if(!username || !password){

          return json(
            {
              error:
                "请输入用户名和密码"
            },
            400
          );

        }


        const response =
          await fetch(
            `${SYNAPSE_URL}/_matrix/client/v3/login`,
            {

              method:"POST",

              headers:{
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  type:
                    "m.login.password",

                  identifier:{
                    type:"m.id.user",
                    user:username
                  },

                  password,

                  initial_device_display_name:
                    "ChatID"

                })

            }
          );


        const data =
          await response.json();


        if(!response.ok){

          return json(
            {
              error:
                data.error ||
                "用户名或密码错误"
            },
            response.status
          );

        }


        return json({

          user_id:
            data.user_id,

          device_id:
            data.device_id,

          access_token:
            data.access_token

        });


      }catch(e){

        console.error(e);


        return json(
          {
            error:
              "无法连接 Synapse"
          },
          502
        );

      }

    }


    /*
     * ============================================================
     * API：注册发送验证码
     * ============================================================
     */

if (
  url.pathname ===
    "/api/register/send-code" &&
  request.method === "POST"
) {

  try{

    const body =
      await request.json();


    const email =
      body.email?.trim()
      .toLowerCase();


    /*
     * --------------------------------------------------------
     * 基础邮箱格式检查
     * --------------------------------------------------------
     */

    if(!validEmail(email)){

      return json(
        {
          error:
            "请输入正确的邮箱地址"
        },
        400
      );

    }


    /*
     * --------------------------------------------------------
     * 检查邮箱是否已经注册
     * --------------------------------------------------------
     */

    const availability =
      await checkRegistrationAvailability(
        null,
        email
      );


    if(
      availability.emailExists
    ){

      return json(
        {
          error:
            "该邮箱已被注册"
        },
        400
      );

    }


    /*
     * --------------------------------------------------------
     * 邮箱未注册
     *
     * 正常发送验证码
     * --------------------------------------------------------
     */

    return json(
      await sendCode(
        email,
        "register"
      )
    );


  }catch(e){

    console.error(e);


    return json(
      {
        error:
          e.message ||
          "验证码发送失败"
      },
      500
    );

  }

}



    /*
     * ============================================================
     * API：注册
     * ============================================================
     */

    if (
      url.pathname ===
        "/api/register" &&
      request.method === "POST"
    ) {

      try{

        const body =
          await request.json();


        const username =
          normalizeUsername(
            body.username || ""
          );


        const email =
          body.email?.trim()
          .toLowerCase();


        const invite =
          normalizeInvite(
            body.invite || ""
          );


        const code =
          body.code?.trim();


        const password =
          body.password || "";


        /*
         * --------------------------------------------------------
         * 基础验证
         * --------------------------------------------------------
         */

        if(!validUsername(username)){

          return json(
            {
              error:
                "用户名只能包含小写字母、数字、点、下划线、连字符和等号"
            },
            400
          );

        }


        if(!validEmail(email)){

          return json(
            {
              error:
                "邮箱格式不正确"
            },
            400
          );

        }


        if(!invite){

          return json(
            {
              error:
                "请输入邀请码"
            },
            400
          );

        }


        if(!code){

          return json(
            {
              error:
                "请输入验证码"
            },
            400
          );

        }


        if(password.length < 8){

          return json(
            {
              error:
                "密码至少需要 8 位"
            },
            400
          );

        }


/*
 * --------------------------------------------------------
 * 检查用户名 / 邮箱是否已经注册
 *
 * 这里再次检查。
 * 即使前面的「获取验证码」已经检查过，
 * 这里仍然必须检查，作为最终后端防线。
 * --------------------------------------------------------
 */

const availability =
  await checkRegistrationAvailability(
    username,
    email
  );


if(
  availability.usernameExists
){

  return json(
    {
      error:
        "该用户名已被注册"
    },
    400
  );

}


if(
  availability.emailExists
){

  return json(
    {
      error:
        "该邮箱已被注册"
    },
    400
  );

}


/*
 * --------------------------------------------------------
 * 验证邮箱验证码
 * --------------------------------------------------------
 */

const verified =
  await verifyCode(
    email,
    code,
    "register"
  );


        if(!verified){

          return json(
            {
              error:
                "验证码错误或已过期"
            },
            400
          );

        }


        /*
         * --------------------------------------------------------
         * 验证邀请码
         * --------------------------------------------------------
         */

        const inviteKey =
          `invite:${invite}`;


        const inviteExists =
          await env.CHATID_KV.get(
            inviteKey
          );


        if(!inviteExists){

          return json(
            {
              error:
                "邀请码无效或已使用"
            },
            400
          );

        }


        /*
         * --------------------------------------------------------
         * 创建 Synapse 用户
         * --------------------------------------------------------
         */

        const uid =
          userId(username);


        const response =
          await fetch(
            `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(uid)}`,
            {

              method:"PUT",

              headers:{

                "Authorization":
                  `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`,

                "Content-Type":
                  "application/json"

              },

              body:
                JSON.stringify({

                  password,

                  displayname:
                    username,

                  threepids:[
                    {
                      medium:"email",
                      address:email
                    }
                  ],

                  admin:false,

                  deactivated:false

                })

            }
          );


        const data =
          await response.json();


        if(!response.ok){

          return json(
            {
              error:
                data.error ||
                "创建账号失败"
            },
            response.status
          );

        }


        /*
         * --------------------------------------------------------
         * Synapse 创建成功
         *
         * 现在才消耗邀请码
         * --------------------------------------------------------
         */

        await env.CHATID_KV.delete(
          inviteKey
        );


        return json({
          success:true
        });


      }catch(e){

        console.error(e);


        return json(
          {
            error:
              "注册失败"
          },
          500
        );

      }

    }


    /*
     * ============================================================
     * API：忘记密码发送验证码
     * ============================================================
     */

    if (
      url.pathname ===
        "/api/forgot/send-code" &&
      request.method === "POST"
    ) {

      try{

        const body =
          await request.json();


        const email =
          body.email?.trim()
          .toLowerCase();


        if(!validEmail(email)){

          return json(
            {
              error:
                "请输入正确的邮箱地址"
            },
            400
          );

        }


        return json(
          await sendCode(
            email,
            "forgot"
          )
        );


      }catch(e){

        console.error(e);


        return json(
          {
            error:
              "验证码发送失败"
          },
          500
        );

      }

    }


    /*
     * ============================================================
     * API：忘记密码
     * ============================================================
     */

    if (
      url.pathname === "/api/forgot" &&
      request.method === "POST"
    ) {

      try{

        const body =
          await request.json();


        const email =
          body.email?.trim()
          .toLowerCase();


        const code =
          body.code?.trim();


        const password =
          body.password || "";


        if(!validEmail(email)){

          return json(
            {
              error:
                "邮箱格式不正确"
            },
            400
          );

        }


        if(password.length < 8){

          return json(
            {
              error:
                "密码至少需要 8 位"
            },
            400
          );

        }


        const verified =
          await verifyCode(
            email,
            code,
            "forgot"
          );


        if(!verified){

          return json(
            {
              error:
                "验证码错误或已过期"
            },
            400
          );

        }


        /*
         * 根据邮箱查找 Matrix 用户
         */

        const response =
          await fetch(
            `${SYNAPSE_URL}/_synapse/admin/v2/users?threepid=${encodeURIComponent(email)}`,
            {

              headers:{
                "Authorization":
                  `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`
              }

            }
          );


        if(!response.ok){

          return json({
            success:true
          });

        }


        const data =
          await response.json();


        const users =
          Array.isArray(data)
            ? data
            : data.users || [];


        if(!users.length){

          return json({
            success:true
          });

        }


        const uid =
          users[0].name ||
          users[0].user_id;


        /*
         * 重置密码
         */

        const reset =
          await fetch(
            `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(uid)}`,
            {

              method:"PUT",

              headers:{

                "Authorization":
                  `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`,

                "Content-Type":
                  "application/json"

              },

              body:
                JSON.stringify({

                  password,

                  logout_devices:true

                })

            }
          );


        if(!reset.ok){

          const text =
            await reset.text();


          console.error(
            "Password reset:",
            text
          );


          return json(
            {
              error:
                "密码重置失败"
            },
            500
          );

        }


        return json({
          success:true
        });


      }catch(e){

        console.error(e);


        return json(
          {
            error:
              "密码重置失败"
          },
          500
        );

      }

    }


/*
 * ============================================================
 * API：验证登录状态
 * ============================================================
 */

if (
  url.pathname === "/api/whoami" &&
  request.method === "GET"
) {

  try {

    const token =
      request.headers.get(
        "Authorization"
      )
      ?.replace(
        "Bearer ",
        ""
      );


    if(!token){

      return json(
        {
          error:
            "未登录"
        },
        401
      );

    }


    const response =
      await fetch(
        `${SYNAPSE_URL}/_matrix/client/v3/account/whoami`,
        {

          headers:{
            "Authorization":
              `Bearer ${token}`
          }

        }
      );


    if(!response.ok){

      return json(
        {
          error:
            "登录状态已失效"
        },
        401
      );

    }


    const data =
      await response.json();


    return json({

      user_id:
        data.user_id

    });


  }catch(e){

    console.error(e);


    return json(
      {
        error:
          "验证失败"
      },
      500
    );

  }

}    


/*
 * ============================================================
 * API：获取资料
 * ============================================================
 */

if (
  url.pathname === "/api/profile" &&
  request.method === "GET"
) {

  try{

    const user_id =
      url.searchParams.get(
        "user_id"
      );


    const response =
      await fetch(
        `${SYNAPSE_URL}/_matrix/client/v3/profile/${encodeURIComponent(user_id)}/displayname`
      );


    if(!response.ok){

      return json({
        displayname:""
      });

    }


    const data =
      await response.json();


/*
 * 获取邮箱
 */

const admin =
  await fetch(
    `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(user_id)}`,
    {
      headers:{
        "Authorization":
          `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`
      }
    }
  );


let email = "";


if(admin.ok){

  const user =
    await admin.json();


  const threepids =
    user.threepids || [];


  const item =
    threepids.find(
      x =>
        x.medium === "email"
    );


  if(item){

    email =
      item.address;

  }

}


return json({

  displayname:
    data.displayname || "",

  email

});


  }catch(e){

    return json(
      {
        displayname:""
      }
    );

  }

}


/*
 * ============================================================
 * API：获取当前设备
 * ============================================================
 */

if (
  url.pathname === "/api/device" &&
  request.method === "GET"
) {


  const ua =
    request.headers.get(
      "User-Agent"
    ) || "";


  return json({

    device:
      parseUserAgent(ua)

  });


}


/*
 * ============================================================
 * API：修改昵称
 * ============================================================
 */

if (
  url.pathname ===
    "/api/change-displayname" &&
  request.method === "POST"
) {

  try {

    const body =
      await request.json();


    const token =
      body.token;


    const displayname =
      body.displayname?.trim();


    if(!token){

      return json(
        {
          error:
            "登录状态已失效"
        },
        401
      );

    }


    if(
      !displayname ||
      displayname.length > 50
    ){

      return json(
        {
          error:
            "昵称长度必须为 1～50 个字符"
        },
        400
      );

    }


    /*
     * 获取当前用户
     */

    const who =
      await fetch(
        `${SYNAPSE_URL}/_matrix/client/v3/account/whoami`,
        {

          headers:{
            "Authorization":
              `Bearer ${token}`
          }

        }
      );


    if(!who.ok){

      return json(
        {
          error:
            "登录状态已失效"
        },
        401
      );

    }


    const account =
      await who.json();


    /*
     * 修改昵称
     */

    const response =
      await fetch(
        `${SYNAPSE_URL}/_matrix/client/v3/profile/${encodeURIComponent(account.user_id)}/displayname`,
        {

          method:"PUT",

          headers:{

            "Authorization":
              `Bearer ${token}`,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              displayname

            })

        }
      );


    if(!response.ok){

      const text =
        await response.text();


      console.error(
        "Change displayname:",
        text
      );


      return json(
        {
          error:
            "昵称修改失败"
        },
        500
      );

    }


    return json({

      success:true,

      displayname

    });


  }catch(e){

    console.error(e);


    return json(
      {
        error:
          "昵称修改失败"
      },
      500
    );

  }

}


/*
 * ============================================================
 * API：换绑邮箱发送验证码
 * ============================================================
 */

if (
  url.pathname ===
    "/api/change-email/send-code" &&
  request.method === "POST"
) {

  try {


    const body =
      await request.json();


    const email =
      body.email
        ?.trim()
        .toLowerCase();


    if(!validEmail(email)){

      return json(
        {
          error:
            "邮箱格式不正确"
        },
        400
      );

    }

    const availability =
      await checkRegistrationAvailability(
       null,
       email
      );


      if(availability.emailExists){

       return json(
       {
        error:
         "该邮箱已经绑定其他账号"
       },
       400
       );

      }


return json(
 await sendCode(
   email,
   "change-email"
 )
);


  }catch(e){

    console.error(e);


    return json(
      {
        error:
          e.message ||
          "验证码发送失败"
      },
      500
    );

  }

}


/*
 * ============================================================
 * API：修改邮箱
 * ============================================================
 */

if (
  url.pathname === "/api/change-email" &&
  request.method === "POST"
) {

  try {


    const body =
      await request.json();


    const token =
      body.token;


    const email =
      body.email
        ?.trim()
        .toLowerCase();


    const code =
      body.code
        ?.trim();



    if(!token){

      return json(
        {
          error:
            "登录状态已失效"
        },
        401
      );

    }



    if(!validEmail(email)){

      return json(
        {
          error:
            "邮箱格式不正确"
        },
        400
      );

    }



    /*
     * 验证当前登录状态
     */

    const who =
      await fetch(
        `${SYNAPSE_URL}/_matrix/client/v3/account/whoami`,
        {

          headers:{
            "Authorization":
              `Bearer ${token}`
          }

        }
      );


    if(!who.ok){

      return json(
        {
          error:
            "登录状态已失效，请重新登录"
        },
        401
      );

    }


    const account =
      await who.json();



    /*
     * 检查新邮箱是否已经被使用
     */

    const availability =
      await checkRegistrationAvailability(
        null,
        email
      );


    if(
      availability.emailExists
    ){

      return json(
        {
          error:
            "该邮箱已经绑定其他账号"
        },
        400
      );

    }



    /*
     * 验证验证码
     */

    const verified =
      await verifyCode(
        email,
        code,
        "change-email"
      );


    if(!verified){

      return json(
        {
          error:
            "验证码错误或已过期"
        },
        400
      );

    }



    /*
     * 获取当前用户资料
     */

    const userResponse =
      await fetch(
        `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(account.user_id)}`,
        {

          headers:{
            "Authorization":
              `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`
          }

        }
      );


    if(!userResponse.ok){

      return json(
        {
          error:
            "获取用户信息失败"
        },
        500
      );

    }


    const user =
      await userResponse.json();



    /*
     * 保留其他信息，只替换邮箱
     */

    const update =
      await fetch(
        `${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(account.user_id)}`,
        {

          method:"PUT",

          headers:{

            "Authorization":
              `Bearer ${env.SYNAPSE_ADMIN_TOKEN}`,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              threepids:[
                {
                  medium:"email",
                  address:email
                }
              ]

            })

        }
      );



    if(!update.ok){

      const text =
        await update.text();


      console.error(
        "Change email:",
        text
      );


      return json(
        {
          error:
            "邮箱修改失败"
        },
        500
      );

    }



    return json({

      success:true

    });



  }catch(e){

    console.error(e);


    return json(
      {
        error:
          e.message ||
          "邮箱修改失败"
      },
      500
    );

  }

}


    /*
     * ============================================================
     * API：修改密码
     * ============================================================
     */

    if (
      url.pathname ===
        "/api/change-password" &&
      request.method === "POST"
    ) {

      try{

        const body =
          await request.json();


        const token =
          body.token;


        const oldPassword =
          body.old_password;


        const newPassword =
          body.new_password;


        if(!token){

          return json(
            {
              error:
                "登录状态已失效"
            },
            401
          );

        }


        if(!oldPassword){

          return json(
            {
              error:
                "请输入当前密码"
            },
            400
          );

        }


        if(
          !newPassword ||
          newPassword.length < 8
        ){

          return json(
            {
              error:
                "新密码至少需要 8 位"
            },
            400
          );

        }


        /*
         * 先验证当前 token
         */

        const who =
          await fetch(
            `${SYNAPSE_URL}/_matrix/client/v3/account/whoami`,
            {

              headers:{
                "Authorization":
                  `Bearer ${token}`
              }

            }
          );


        if(!who.ok){

          return json(
            {
              error:
                "登录状态已失效，请重新登录"
            },
            401
          );

        }


        const account =
          await who.json();


        /*
         * 修改密码
         */

        const response =
          await fetch(
            `${SYNAPSE_URL}/_matrix/client/v3/account/password`,
            {

              method:"POST",

              headers:{

                "Authorization":
                  `Bearer ${token}`,

                "Content-Type":
                  "application/json"

              },

              body:
                JSON.stringify({

                  auth:{

                    type:
                      "m.login.password",

                    identifier:{

                      type:
                        "m.id.user",

                      user:
                        account.user_id

                    },

                    password:
                      oldPassword

                  },

                  new_password:
                    newPassword,

                  logout_devices:
                    true

                })

            }
          );


        const data =
          await response.json();


        if(!response.ok){

          return json(
            {
              error:
                data.error ||
                "修改密码失败"
            },
            response.status
          );

        }


        return json({

          success:true,

          user_id:
            account.user_id

        });


      }catch(e){

        console.error(e);


        return json(
          {
            error:
              "修改密码失败"
          },
          500
        );

      }

    }


    /*
     * ============================================================
     * Not Found
     * ============================================================
     */

    return new Response(
      "Not Found",
      {
        status:404
      }
    );

  }

};


/*
 * =================================================================
 * 公共 CSS
 * =================================================================
 */

const COMMON_CSS = `

*{
  box-sizing:border-box
}

body{

  margin:0;

  min-height:100vh;

  display:flex;

  align-items:center;

  justify-content:center;

  background:#f5f5f7;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "Helvetica Neue",
    Arial,
    sans-serif;

  color:#1d1d1f;
}

.card{

  width:min(
    390px,
    calc(100% - 32px)
  );

  background:#fff;

  border-radius:20px;

  padding:36px 32px;

  box-shadow:
    0 8px 40px rgba(0,0,0,.08);
}

.logo{

  font-size:28px;

  font-weight:700;

  letter-spacing:-.8px;
}

.subtitle{

  margin-top:8px;

  color:#86868b;

  font-size:15px;
}

form{

  margin-top:30px;
}

label{

  display:block;

  margin:
    16px 0 7px;

  font-size:14px;

  color:#555;
}

input{

  width:100%;

  height:46px;

  padding:
    0 14px;

  border:
    1px solid #d2d2d7;

  border-radius:10px;

  font-size:16px;

  outline:none;

  background:#fff;
}

input:focus{

  border-color:#1d1d1f;
}

button{

  width:100%;

  height:46px;

  margin-top:24px;

  border:0;

  border-radius:12px;

  background:#1d1d1f;

  color:#fff;

  font-size:16px;

  cursor:pointer;
}

button:disabled{

  opacity:.5;

  cursor:default;
}

.secondary{

  background:#f2f2f7;

  color:#1d1d1f;
}

.error{

  margin-top:16px;

  color:#d70015;

  font-size:14px;

  display:none;
}

.links{

  margin-top:22px;

  text-align:center;

  font-size:14px;
}

.links a{

  color:#555;

  text-decoration:none;
}

.actions{

  margin-top:30px;

  display:grid;

  gap:12px;
}

.actions button{

  margin-top:0;
}

`;
