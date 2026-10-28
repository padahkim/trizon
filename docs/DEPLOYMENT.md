# PR 미리보기 배포

개발 리뷰에는 Vercel을 사용한다. PR에서 미리보기 링크를 열어 확인하며, 로컬 개발 서버를 실행할 필요가 없다. 다른 사용자에게 서비스를 공개하는 것은 PRD의 8단계에서 별도로 진행한다.

## 프로젝트 연결

Vercel 계정 인증과 GitHub 저장소 연결이 필요하다. 설정할 값은 다음과 같다.

연결된 프로젝트는 [Vercel의 trizon](https://vercel.com/padahkim-gmailcoms-projects/trizon)이다. 배포 상세와 로그는 이 프로젝트 또는 PR의 Vercel 링크에서 확인한다.

| 항목 | 값 |
| --- | --- |
| Git 저장소 | `padahkim/trizon` |
| 프레임워크 | Next.js |
| Root Directory | 저장소 루트 |
| Node.js | `22.x` (저장소 요구사항: 22.18 이상·23 미만) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js 기본값 |
| Production Branch | `development` |
| Vercel Authentication | 활성화 |
| 보호 범위 | All Deployments |

현재 앱에는 필수 환경 변수가 없다. 시세 API는 Node 런타임에서 Yahoo를 사용한다. `TRIZON_QUOTES=fake`는 기존 가짜 4종목의 고정 시세를 확인할 때만 사용하고, 일반 미리보기 배포에는 설정하지 않는다.

첫 배포도 보호해야 한다. Vercel의 최초 프로젝트 배포는 Production 환경을 사용한다. Preview만 보호하는 설정으로는 메인 배포 주소가 공개되므로, 배포를 시작하기 전에 All Deployments 보호가 적용되도록 프로젝트를 준비한다. 접근 권한이 있는 Vercel 계정으로 앱과 시세 API가 함께 열리는지 확인한다.

연결 후에는 PR 브랜치의 push가 Preview 배포를 만들고, `development`의 push·merge는 Production 배포를 갱신한다. 실제 프로젝트 연결·보호 설정과 검증 결과는 [#43](https://github.com/padahkim/trizon/issues/43)에 기록한다.

## PR에서 리뷰하기

1. PR에 표시된 Vercel 배포 상태가 성공인지 확인하고, 연결된 커밋이 리뷰할 커밋과 같은지 확인한다.
2. 미리보기 링크를 열어 허용된 Vercel 계정으로 접속한다.
3. 가짜 CSV를 준비하려면 의존성 설치 후 `npm run review:fixtures`를 실행한다. 임시 폴더에 일본주식용 Shift_JIS CSV와 미국주식용 UTF-8 CSV가 생성되고, 파일의 절대 경로 두 개가 출력된다. 두 파일을 앱에서 함께 고른다.
4. 일본주식 2종목과 미국주식 2종목, 통화별 요약을 확인한다. 같은 주소에서 새로고침해도 보유가 복원되어야 한다.
5. 가짜 종목은 실제 Yahoo 시세를 받을 수 있다고 가정하지 않는다. 고정 시세를 설정한 검증 배포에서만 기존 e2e와 같은 평가액·손익을 확인한다. 실제 Yahoo 조회는 아래의 공개 종목으로 따로 확인한다.
6. 같은 PR에 새 커밋을 push하면 새 배포가 완료된 뒤 변경이 반영되었는지 확인한다. 빌드가 실패하면 PR의 배포 상태에서 Vercel 배포 상세를 열어 Build Logs를 확인한다.

CSV와 보유 내역은 브라우저의 주소별 저장소에 있다. 로컬 주소·서로 다른 PR 주소·커밋별 배포 주소는 저장소가 다르다. 같은 PR을 반복 확인할 때는 Vercel의 브랜치 주소를 사용하면 같은 주소의 저장소를 계속 쓸 수 있다. 새 주소에서 보유가 비어 있으면 가짜 CSV를 다시 올린다.

## 배포 연결 완료 확인

- 테스트 PR의 최초 배포와 추가 push가 모두 성공하고, PR 링크에서 최신 변경이 보인다.
- 다른 PR은 별도 링크와 커밋을 가리킨다.
- 가짜 CSV 업로드와 같은 주소에서의 새로고침 복원이 동작한다.
- 배포한 주소에서 `/api/quotes?keys=JP%3A7203%2CUS%3AAAPL`을 열어 두 공개 종목의 시세가 반환되는지 확인한다. 정상 조회와 외부 서비스 실패를 구분하고, 실패했다면 원인과 해결 여부를 기록한다.
- 시세 조회 실패 시에는 기존 실패 안내와 대체 평가가 유지된다. 결정적인 회귀 검증에는 기존 가짜 시세·오류 주입 테스트를 사용한다.
- Vercel에 로그인하지 않은 별도 브라우저 세션에서는 Preview와 Production의 앱·시세 API 모두 보호된다.
- 검증한 PR·커밋과 결과를 이슈에 남긴다. 미실행 항목은 통과로 표시하지 않는다.

앱 로그인·Supabase를 추가할 때는 해당 작업에서 미리보기 주소의 OAuth callback과 데이터 환경을 별도로 설정한다. 현재 배포 연결 작업의 선행 조건은 아니다.

## 공식 문서

- [GitHub 연동과 PR 미리보기](https://vercel.com/docs/git/vercel-for-github)
- [배포 접근 보호](https://vercel.com/docs/deployment-protection)
- [Preview·Production과 최초 배포](https://vercel.com/docs/deployments/environments)
