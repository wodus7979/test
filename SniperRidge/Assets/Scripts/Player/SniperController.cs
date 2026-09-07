using System.Collections;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// 1인칭 저격수 조작: 시점 회전, 조준경, 숨 참기, 볼트액션 사격, 재장전, 영점 조절, 거리 측정.
    /// 키보드/마우스(PC)와 터치 UI(모바일) 양쪽 입력을 받는다.
    /// </summary>
    public class SniperController : MonoBehaviour
    {
        public enum WeaponState { Ready, Bolting, Reloading }

        public float MouseSensitivity = 2.2f;
        public float TouchSensitivity = 0.12f;
        public float MinPitch = -30f;   // 위쪽 (음수)
        public float MaxPitch = 25f;    // 아래쪽
        public int MagSize = 5;

        // 조준경 배율 (기본 16배, 휠/Z 로 순환)
        static readonly float[] ScopeFovs = { 7.5f, 3.75f, 2f };
        static readonly string[] ScopeLabels = { "8x", "16x", "30x" };
        const float BaseFov = 60f;

        public bool IsScoped { get; private set; }
        public int AmmoInMag { get; private set; } = 5;
        public int Reserve { get; private set; } = 25;
        public int ZeroRange { get; private set; } = 300;
        public float RangeMeters { get; private set; } = -1f;
        public float Breath { get; private set; } = 1f;
        public bool HoldingBreath { get; private set; }
        public WeaponState State { get; private set; } = WeaponState.Ready;
        public string ZoomLabel => ScopeLabels[zoomIndex];
        public Transform Eye => cam.transform;
        public bool IsDesktop => desktop;

        public string StateLabel
        {
            get
            {
                switch (State)
                {
                    case WeaponState.Bolting: return "노리쇠 작동";
                    case WeaponState.Reloading: return "재장전 중";
                    default:
                        if (AmmoInMag > 0) return "사격 준비";
                        return Reserve > 0 ? "재장전 필요" : "탄약 없음";
                }
            }
        }

        Camera cam;
        GameObject rifleModel;
        Light muzzleLight;
        GameManager gm;

        float yaw, pitch, recoil;
        int zoomIndex = 1;
        float stateTimer;
        float zeroAngle;
        bool breathLocked;
        bool inputEnabled = true;
        bool desktop;

        Vector2 lookInput;
        bool fireQueued, scopeToggleQueued, reloadQueued, zoomQueued, touchBreath;
        int zeroDelta;

        public void Init(Camera camera, GameObject rifle, Light muzzle)
        {
            cam = camera;
            rifleModel = rifle;
            muzzleLight = muzzle;
            yaw = transform.eulerAngles.y;
            zeroAngle = Ballistics.ZeroAngleDegrees(ZeroRange);
            desktop = !Application.isMobilePlatform;
        }

        void Start()
        {
            gm = GameManager.Instance;
        }

        // ---------- 외부(터치 UI) 입력 ----------

        public void AddLook(Vector2 pixelDelta) => lookInput += pixelDelta * TouchSensitivity;
        public void PressFire() => fireQueued = true;
        public void ToggleScope() => scopeToggleQueued = true;
        public void SetBreath(bool held) => touchBreath = held;
        public void PressReload() => reloadQueued = true;
        public void CycleZoom() => zoomQueued = true;
        public void AdjustZero(int steps) => zeroDelta += steps;

        public void OnMissionEnd()
        {
            inputEnabled = false;
            IsScoped = false;
            HoldingBreath = false;
            touchBreath = false;
            if (desktop)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        // ---------- 메인 루프 ----------

        void Update()
        {
            if (gm == null) return;
            float dt = Time.deltaTime;

            if (desktop) GatherDesktopInput();
            if (!inputEnabled)
            {
                lookInput = Vector2.zero;
                fireQueued = scopeToggleQueued = reloadQueued = zoomQueued = false;
                zeroDelta = 0;
            }

            // 시점 회전 (배율이 높을수록 감도 감소)
            float sens = cam.fieldOfView / BaseFov;
            yaw += lookInput.x * sens;
            pitch -= lookInput.y * sens;
            pitch = Mathf.Clamp(pitch, MinPitch, MaxPitch);
            lookInput = Vector2.zero;

            // 숨 참기
            bool wantHold = inputEnabled &&
                            (touchBreath || (desktop && (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.Space))));
            if (breathLocked && Breath > 0.35f) breathLocked = false;
            HoldingBreath = wantHold && !breathLocked && Breath > 0f;
            if (HoldingBreath)
            {
                Breath -= dt / 5f;
                if (Breath <= 0f)
                {
                    Breath = 0f;
                    breathLocked = true;
                    HoldingBreath = false;
                }
            }
            else
            {
                Breath = Mathf.Min(1f, Breath + dt / 3.5f);
            }

            // 흔들림
            float amp = IsScoped ? 0.32f : 0.9f;
            if (HoldingBreath) amp *= 0.12f;
            else if (Breath < 0.3f) amp *= 2.2f;
            float t = Time.time;
            float swayX = (Mathf.PerlinNoise(t * 0.55f, 0.3f) - 0.5f) * 2f * amp;
            float swayY = (Mathf.PerlinNoise(0.7f, t * 0.47f) - 0.5f) * 2f * amp;
            recoil = Mathf.Lerp(recoil, 0f, dt * 5f);

            transform.rotation = Quaternion.Euler(0f, yaw + swayX, 0f);
            cam.transform.localRotation = Quaternion.Euler(pitch + swayY - recoil, 0f, 0f);

            // 조준경 / 배율 / 영점
            if (scopeToggleQueued)
            {
                scopeToggleQueued = false;
                IsScoped = !IsScoped;
            }
            if (zoomQueued)
            {
                zoomQueued = false;
                if (IsScoped) zoomIndex = (zoomIndex + 1) % ScopeFovs.Length;
            }
            if (zeroDelta != 0)
            {
                ZeroRange = Mathf.Clamp(ZeroRange + zeroDelta * 50, 100, 600);
                zeroDelta = 0;
                zeroAngle = Ballistics.ZeroAngleDegrees(ZeroRange);
            }
            float targetFov = IsScoped ? ScopeFovs[zoomIndex] : BaseFov;
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov, dt * 14f);
            if (rifleModel != null && rifleModel.activeSelf == IsScoped) rifleModel.SetActive(!IsScoped);

            // 무기 상태
            if (State != WeaponState.Ready)
            {
                stateTimer -= dt;
                if (stateTimer <= 0f)
                {
                    if (State == WeaponState.Reloading)
                    {
                        int need = MagSize - AmmoInMag;
                        int take = Mathf.Min(need, Reserve);
                        AmmoInMag += take;
                        Reserve -= take;
                    }
                    State = WeaponState.Ready;
                }
            }
            if (reloadQueued)
            {
                reloadQueued = false;
                TryReload();
            }
            if (fireQueued)
            {
                fireQueued = false;
                if (State == WeaponState.Ready)
                {
                    if (AmmoInMag > 0) Fire();
                    else if (Reserve > 0) TryReload();
                    else gm.PlaySound(gm.Sounds.Click, 0.6f);
                }
            }

            // 거리 측정
            RangeMeters = Physics.Raycast(cam.transform.position, cam.transform.forward, out RaycastHit hit, 3000f, ~0, QueryTriggerInteraction.Ignore)
                ? hit.distance
                : -1f;
        }

        void GatherDesktopInput()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }

            if (Cursor.lockState != CursorLockMode.Locked)
            {
                if (inputEnabled && Input.GetMouseButtonDown(0))
                {
                    Cursor.lockState = CursorLockMode.Locked;
                    Cursor.visible = false;
                }
                return;
            }

            lookInput += new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * MouseSensitivity;
            if (Input.GetMouseButtonDown(0)) fireQueued = true;
            if (Input.GetMouseButtonDown(1)) scopeToggleQueued = true;
            if (Input.GetKeyDown(KeyCode.R)) reloadQueued = true;
            if (Input.GetKeyDown(KeyCode.Z) || Mathf.Abs(Input.mouseScrollDelta.y) > 0.01f) zoomQueued = true;
            if (Input.GetKeyDown(KeyCode.UpArrow)) zeroDelta++;
            if (Input.GetKeyDown(KeyCode.DownArrow)) zeroDelta--;
        }

        // ---------- 사격 ----------

        void Fire()
        {
            AmmoInMag--;
            State = WeaponState.Bolting;
            stateTimer = 1.15f;
            recoil = 2.4f;

            // 영점 보정: 총구를 조준선보다 약간 위로
            Vector3 dir = Quaternion.AngleAxis(-zeroAngle, cam.transform.right) * cam.transform.forward;
            Bullet.Fire(cam.transform.position + cam.transform.forward * 0.6f, dir, gm.Wind.Wind);

            gm.PlaySound(gm.Sounds.Gunshot, 1f);
            StartCoroutine(MuzzleFlash());
            StartCoroutine(BoltCycle());
            gm.OnPlayerShot();
        }

        IEnumerator MuzzleFlash()
        {
            if (muzzleLight == null) yield break;
            muzzleLight.enabled = true;
            yield return new WaitForSeconds(0.06f);
            muzzleLight.enabled = false;
        }

        IEnumerator BoltCycle()
        {
            yield return new WaitForSeconds(0.35f);
            gm.PlaySound(gm.Sounds.Bolt, 0.7f);
        }

        void TryReload()
        {
            if (State != WeaponState.Ready || AmmoInMag >= MagSize || Reserve <= 0) return;
            State = WeaponState.Reloading;
            stateTimer = 2.6f;
            gm.PlaySound(gm.Sounds.Bolt, 0.5f, 0.8f);
        }
    }
}
