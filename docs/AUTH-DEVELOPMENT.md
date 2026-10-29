# 인증 기반 개발과 로컬 검증

#49는 #34에서 연결할 비활성 인증 모듈이다. 현재 `app/`의 화면·API·자산 저장 경로는 이 모듈을 호출하지 않는다. 기본 개발 서버·빌드·1단계 e2e에는 Supabase 환경 변수나 클라우드 계정이 필요 없다. `SavedV1`과 localStorage 자산을 계정 데이터 계약으로 사용하지 않는다.

## 모듈과 결과

| 경계 | 코드와 계약 |
| --- | --- |
| 브라우저 SDK | `lib/auth/browser.ts`의 `createBrowserAuth`: 공식 `@supabase/ssr` 브라우저 클라이언트. 기본 브라우저 singleton·쿠키 adapter를 사용한다. |
| 요청별 서버 SDK | `server/auth/client.ts`의 `createServerAuth(request)`: 요청마다 새 클라이언트·쿠키 변경 목록·캐시 헤더를 만든다. 반환 객체를 모듈 전역에 저장하거나 요청 사이에 공유하지 않는다. |
| 서버 인증 | `verifyServerAuth`: SDK `getClaims()`로 JWT 확인·갱신 후 `getUser()`로 현재 Auth 사용자 상태를 확인한다. 쿠키의 `getSession().user`는 인가에 사용하지 않는다. |
| 요청의 계정 결속 | `verifyBoundServerAuth(client, expected)`: 위 서버 인증을 먼저 수행한 뒤 `{ uid, sessionId }`를 비교한다. 본문 식별자는 인증을 허용하지 않고, 불일치 시 `stale`로 거부하는 데만 사용한다. |
| OAuth와 로그아웃 | `server/auth/handlers.ts`: `handleGoogleLogin`, `handleAuthCallback`, `handleLocalLogout`. 아직 Next.js route로 등록하지 않는다. |
| 브라우저 작업 조율 | `bindBrowserAuth(client)`: `prepare`, `canSend`, `canReceive`, `snapshot`, `subscribe`, `dispose`. 순수 세대 조율은 `lib/auth/coordinator.ts`에 있다. |
| 쿠키 변경 요청 검사 | `lib/auth/http.ts`의 `readAuthMutation`: 정확한 Origin·지정된 메서드·JSON 객체·사용자 정의 헤더를 검사한다. |
| 가입 정책 | `supabase/migrations/20261030000000_owner_signup_hook.sql`: 비공개 허용 목록과 Before User Created hook. 자산 테이블은 만들지 않는다. |

서버 인증 결과는 다음과 같다. 원본 SDK 오류·사용자 이메일·토큰을 결과에 넣지 않는다.

| `status` | 의미와 후속 처리 |
| --- | --- |
| `authenticated` | 검증된 `identity: { uid, sessionId }`. 보호할 서버 작업에서 다시 확인한다. Proxy 통과 자체는 인가가 아니다. |
| `signed_out` | 세션 없음. 로그인 진입 대상으로 처리한다. |
| `expired` | Auth가 확인한 세션 만료·소멸 또는 갱신 토큰 거부. 재로그인이 필요하다. |
| `invalid` | 변조·잘못된 JWT, 식별자 누락·불일치 등. 인증된 사용자로 처리하지 않는다. |
| `unavailable` | 연결 실패·서버 장애·요청 제한 등으로 확인할 수 없음. 만료로 간주하거나 사용자 자산을 지우지 않는다. |
| `stale` | `verifyBoundServerAuth`에서만 반환. 인증된 계정/세션과 요청 준비 당시 식별자가 다름. 작업을 실행하지 않는다. |

`getClaims()`의 서명·만료 검사는 즉시 세션 취소 확인이 아니다. `getUser()`는 현재 Auth 사용자 상태가 필요할 때 사용하지만, 로그아웃 직후 남은 유효 JWT나 탈취 JWT의 모든 권한을 즉시 차단한다고 보장하지 않는다. [Supabase 세션 한계](https://supabase.com/docs/guides/auth/sessions)를 따른다.

## #34에서 연결할 때

인증 모듈을 실제로 활성화하는 환경에만 다음 공개 설정을 둔다. service role·secret 키는 사용하지 않는다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<Supabase URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

서버와 브라우저 클라이언트를 각 실행 위치에서 생성한다. `server/auth/`를 브라우저 컴포넌트에서 가져오지 않는다. RSC의 읽기와 쿠키 갱신 책임, 로그인 화면·Proxy matcher·대시보드 접근 제어는 #34에서 연결한다.

`createServerAuth`는 SDK `setAll`의 쿠키를 요청 쿠키에도 반영한다. 인증 확인이 끝난 뒤 최종 응답에 반드시 `context.apply(response)`를 호출한다. redirect·오류·JSON 응답으로 교체해도 동일하다. 이 함수는 `Set-Cookie`, SDK의 `Cache-Control`, `Expires`, `Pragma`를 최종 응답에 적용하고 다른 응답 쿠키를 유지한다. Proxy에서 이어 보낼 때는 갱신된 요청 헤더를 사용한다.

```ts
const context = createServerAuth(request);
const auth = await verifyServerAuth(context.client);
// auth 결과에 따라 여기서 최종 응답을 정한다.
const response = NextResponse.next({ request: { headers: request.headers } });
return context.apply(response);
```

인증·갱신 응답을 공유 캐시·정적 생성·`use cache`에 넣지 않는다. `privateAuthResponse`는 쿠키를 쓰지 않는 인증 관련 응답에도 캐시 금지를 적용한다. `authFetch`는 네트워크 요청에 `no-store`와 5초 타임아웃을 적용하고, SDK가 오류를 기록하기 전에 공급자 상세를 정해진 오류 코드와 일반 문구로 바꾼다. SDK 자체 갱신 재시도 때문에 전체 작업은 5초보다 오래 걸릴 수 있다. 원본 오류, URL 쿼리, OAuth code, 토큰, 쿠키, 사용자 정보, SQL 상세, 자산 원문을 별도 로그에 남기지 않는다.

쿠키는 공식 SSR 기본값인 `SameSite=Lax`, `Path=/`를 사용한다. 현재 HTTP localhost에서 브라우저 SDK가 읽고 갱신할 수 있도록 임의의 `HttpOnly`나 `Secure` 강제를 추가하지 않는다. [공식 SSR 쿠키·캐시 안내](https://supabase.com/docs/guides/auth/server-side/advanced-guide)를 참고한다.

### OAuth와 변경 요청

로그인 시작은 `POST` JSON 객체와 `AUTH_MUTATION_HEADERS`를 사용한다. 쿠키 인증 변경 요청은 Origin이 정확히 `http://localhost:3000`이어야 하며, `X-Trizon-Request: 1`과 `Content-Type: application/json`이 필요하다. `readAuthMutation(request, method)`로 `POST`·`PUT`·`PATCH`·`DELETE` 중 해당 작업의 메서드 하나를 지정한다. 외부·null·누락 Origin, 폼 전송, 잘못된 메서드를 거부한다. credentialed CORS 응답은 추가하지 않는다.

Google 시작은 SDK `signInWithOAuth`가 PKCE verifier·challenge를 생성한다. callback은 별도의 GET 흐름으로 SDK `exchangeCodeForSession`에 code/verifier 교환을 맡긴다. 성공은 `http://localhost:3000/`, 실패는 `/login?reason=oauth_failed`, 취소는 `/login?reason=cancelled`, 교환 후 Auth 확인 장애는 `/login?reason=unavailable`로 보낸다. 로그인 화면에서 재시도를 제공한다. `next`, 요청 URL의 origin, `Host`, forwarded-host로 목적지를 만들지 않는다. callback은 자산을 읽거나 변경하지 않는다. [공식 PKCE 안내](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

### local 로그아웃

로그아웃은 명시적으로 SDK `signOut({ scope: "local" })`을 사용한다. 현재 브라우저 세션을 종료하며 다른 기기 세션과 Google 자체 로그인은 유지한다. 같은 브라우저의 탭들은 세션 변경을 함께 관찰한다. [공식 signOut 범위](https://supabase.com/docs/reference/javascript/auth-signout)

성공은 HTTP 200과 `{ status: "signed_out", localSessionCleared: true }`다. 통신 실패나 확인 실패는 HTTP 503과 `logout_unconfirmed`다. `localSessionCleared`는 SDK 저장 상태 확인 결과로 `true`는 제거됨, `false`는 남아 있음, `null`은 확인 불가다. SDK가 로컬 쿠키를 지웠더라도 원격 취소 성공을 추정하지 않는다. 실패를 성공으로 표시하거나 서버 자산을 삭제하지 않는다. 화면·초안·시세 정리는 #34에서 연결한다.

### 브라우저 계정과 작업 세대

작업 준비 시 `await bound.prepare()`로 티켓을 만들고, 전송 직전에 `await bound.canSend(ticket)`을 확인한다. 응답을 적용하기 직전에 `await bound.canReceive(ticket, payload.auth)`를 확인한다. `payload.auth`는 서버가 인증 결과로 만든 식별자여야 한다. 두 확인 사이에서 인증 상태가 바뀔 수 있으므로 서버에서도 `verifyBoundServerAuth`로 계정·세션 불일치를 거부해야 한다.

티켓은 uid·session_id·인증 세대·요청 세대를 묶는다. 같은 binding에서 새 티켓을 만들면 이전 응답은 무효다. 동시에 유지해야 하는 독립 요청 흐름은 별도 binding을 사용한다. 동일 세션의 토큰 갱신은 작업을 유지하고, 다른 계정·같은 계정의 새 세션·A→B→A는 이전 티켓을 무효화한다.

SDK Auth 이벤트와 쿠키 재확인을 함께 사용한다. `trizon:auth-lifecycle` localStorage 키에는 토큰·자산 없이 식별자와 임의 세대 신호만 저장한다. 다른 탭의 중간 이벤트를 놓쳐도 전송·수신 때 공유 신호를 다시 읽는다. 이 신호나 브라우저에서 디코딩한 JWT는 인가 근거가 아니다. 공유 저장소가 차단되어 세대를 확인할 수 없으면 준비는 `null`, 전송·수신 확인은 `false`로 실패한다. 언마운트 때 `dispose()`로 구독을 해제한다.

HTTP callback·로그아웃에서 쿠키만 바뀌면 브라우저 SDK 이벤트가 즉시 발생하지 않을 수 있다. `subscribe`만으로 즉각적인 화면 정리를 기대하지 않는다. #34는 응답 후 세션 재확인과 다른 탭의 화면 정리를 연결해야 한다. 기반 모듈은 준비·전송·수신 시 쿠키와 세대를 다시 확인해 이전 작업을 거부한다.

실제 자산 초안·시세·캐시 정리와 사용자 안내는 #34 및 후속 자산 이슈에서 적용한다. 이 모듈은 기존 localStorage 자산을 노출·삭제·이관하지 않는다.

## 로컬 검증 실행

Node 22.18 이상 23 미만과 `npm ci`가 필요하다. `npm test`는 통제된 응답만 사용하는 기존 단위 테스트와 인증 모듈 테스트를 실행한다. 실제 Auth·SQL·두 브라우저 탭 검증은 별도 명령이다.

```sh
npm ci
npx playwright install chromium
npm run auth:local:start
npm run test:auth:local
npm run auth:local:stop
```

잠금 파일의 Supabase CLI 2.122.0과 `experimental.stack`을 사용한다. 기본 로컬 검증은 Apple silicon macOS 또는 지원 Linux의 native 런타임으로 실행하며 Docker 설치가 필요 없다. Docker를 선택하려면 시작 명령 대신 `npx supabase start --runtime docker --stack trizon-auth-tests --eager`를 사용한다. 같은 스택의 런타임을 나중에 바꾸지는 않는다. [공식 런타임 요구사항](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)

`SUPABASE_HOME`으로 런타임·합성 DB를 별도 임시 디렉토리에 둘 수 있다. 모든 시작·테스트·정지 명령에 같은 값을 사용한다. 이미 다른 이름의 격리 스택을 시작했다면 테스트에 `TRIZON_AUTH_STACK=<이름>`을 전달한다. 포트 54321·54322를 다른 프로젝트가 사용 중이면 해당 서버를 임의로 중지하지 말고 포트나 스택을 분리한다.

러너는 CLI status의 로컬 자격 증명을 출력하거나 저장소에 쓰지 않고 자식 프로세스에 전달한다. URL이 `127.0.0.1`인 로컬 연결만 허용한다. 테스트는 마이그레이션을 적용하고 무작위 `example.test` 계정 두 개를 허용 목록에 넣어 가입한다. SQL 역할 부정 테스트·세션 만료 제어에는 로컬 `supabase_admin` 연결을 사용한다. 종료 시 이 합성 계정과 허용 목록 행을 지운다. 실패한 테스트를 건너뛰어 통과시키지 않는다.

브라우저 하네스는 테스트 중 임의 포트에만 생성하며 실제 앱에는 진단 경로나 테스트 로그인 기능을 추가하지 않는다. 실제 자산·금융 원문을 쓰지 않으며 Google 계정이나 클라우드 프로젝트를 수정하지 않는다.

| 검증 경계 | 확인 항목 |
| --- | --- |
| 통제된 Auth 응답과 공식 SDK | Google PKCE 시작·성공 교환·취소, 잘못된/만료/재사용 code와 verifier 불일치, 임의 redirect/Host 무시, 서버 확인 장애, 갱신 성공·실제 만료 코드·장애 구분, 로그아웃 실패와 로컬 제거 구분, 민감 오류 상세 로그 차단 |
| 순수 HTTP·작업 조율 | 외부/null/누락 Origin·폼·메서드·JSON·사용자 헤더, 본문 식별자의 인가 우회 차단, A→B→A·새 세션·늦은 응답·응답 식별자 불일치 |
| 실제 로컬 Auth·SQL | 허용/거부 가입과 metadata 위조, hook 직접 실행·허용 목록 조회/변경 권한, hook 오류 시 닫힘, A/B 요청 분리, 실제 갱신·헤더 유지, JWT 변조 거부, 세션 `not_after` 만료 후 다음 갱신 거부, local 로그아웃·다른 기기 유지 |
| 실제 Chromium 탭과 로컬 Auth | 두 탭 A→B→A·동일 계정 새 세션, 알림 누락 시 세대 확인, 공유 저장소 차단 시 작업 거부, localhost SSR 쿠키 옵션 |
| 기존 앱 회귀 | Supabase 환경 변수 없이 전체 1단계 e2e·단위 테스트·타입 검사·린트·빌드 |

실제 세션 만료 테스트는 로컬 Auth의 세션 기한을 과거로 설정하고 다음 SSR 갱신을 유도한다. 아직 만료하지 않은 access JWT가 즉시 취소된다고 증명하는 테스트가 아니다. Google의 실제 callback·취소·재로그인, 클라우드 hook 활성화와 본인 최초 가입·가입 재차단은 #42에서 검증한다. 실제 로그인 화면·callback route·Proxy·대시보드 연결은 #34에서 검증한다.

## 가입 hook 운영 경계

허용 목록은 비어 있는 상태로 시작한다. Before User Created hook은 Auth가 전달하는 `user.email`만 정규화해 확인하며, 누락·허용 밖 계정은 거부하고 `user_metadata`는 무시한다. `security invoker`와 빈 `search_path`를 사용한다. `supabase_auth_admin`에는 스키마 사용·이메일 열 조회·hook 실행만 부여한다. PUBLIC·anon·authenticated의 스키마 접근, hook 실행과 허용 목록 조회·변경은 차단한다. hook 내부 오류는 일반 문구로 실패한다. [공식 hook 권한 모델](https://supabase.com/docs/guides/auth/auth-hooks), [가입 hook 계약](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)

마이그레이션 실행만으로 클라우드 hook이 활성화되지는 않는다. 기존 사용자를 차단하거나 삭제하는 정책도 아니다. 실제 외부 설정은 #33, 클라우드 hook 설정·허용 목록의 본인 등록·제한된 첫 가입·이후 가입 재차단은 #42에서 수행한다. 실제 이메일을 마이그레이션·fixture·문서에 커밋하지 않는다. 자산 스키마와 이관은 #35~#38의 별도 계약으로 정한다.
