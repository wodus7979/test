using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    [DefaultExecutionOrder(320)]
    public sealed class GrenadeController : MonoBehaviour
    {
        public const int MaxCount = 6;
        public int Count { get; private set; } = MaxCount;
        public bool IsAiming { get; private set; }
        public bool BlocksWeapons => IsAiming || Time.time < weaponReadyAt;
        public bool ValidTarget { get; private set; }
        public string AimLabel { get; private set; } = "";
        SniperController player;
        Camera eye;
        GameObject held, preview;
        LineRenderer path, ring;
        readonly Vector3[] points = new Vector3[GrenadeTrajectory.FuseSteps + 1];
        readonly Vector3[] circle = new Vector3[49];
        Vector3 origin, velocity;
        bool releaseQueued;
        float readyAt, weaponReadyAt;

        public void Initialize(SniperController controller, Camera camera) { player = controller; eye = camera; }
        public void ResetMission() { CancelAim(); Count = MaxCount; readyAt = weaponReadyAt = 0f; }
        public int Resupply(int amount)
        {
            int added = Mathf.Clamp(amount, 0, MaxCount - Count); Count += added; return added;
        }

        public void BeginAim()
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying || IsAiming || player.IsMounted) return;
            if (Count <= 0) { gm.Hud.ShowShotFeedback("수류탄이 없습니다"); return; }
            if (Time.time < readyAt) return;
            if (!player.CanFireFromCover) { gm.Hud.ShowShotFeedback("일어선 뒤 W로 투척 위치를 지정하세요"); return; }
            if (player.State != SniperController.WeaponState.Ready)
            { gm.Hud.ShowShotFeedback("장전·무기 교체가 끝난 뒤 W를 다시 누르세요"); return; }
            if (held == null)
            {
                held = new GameObject("HeldGrenade"); held.transform.SetParent(eye.transform, false);
                if (GrenadeProjectile.CreateVisual(held.transform) == null)
                {
                    Destroy(held); held = null;
                    gm.Hud.ShowShotFeedback("수류탄 에셋 누락 · 수류탄 프리팹 생성 메뉴를 실행하세요");
                    return;
                }
                held.transform.localPosition = new Vector3(.22f, -.18f, .43f);
                held.transform.localRotation = Quaternion.Euler(12f, -20f, -18f);
                held.transform.localScale = Vector3.one * 1.25f;
                foreach (var renderer in held.GetComponentsInChildren<Renderer>()) renderer.shadowCastingMode = ShadowCastingMode.Off;
            }
            if (preview == null)
            {
                preview = new GameObject("GrenadeAimPreview");
                preview.transform.SetParent(transform, false);
                path = Line("Trajectory", .045f); ring = Line("PredictedBlastPoint", .055f);
            }
            releaseQueued = false; ValidTarget = false;
            IsAiming = true; held.SetActive(true); preview.SetActive(true);
        }

        LineRenderer Line(string name, float width)
        {
            var go = new GameObject(name); go.transform.SetParent(preview.transform, false);
            var line = go.AddComponent<LineRenderer>();
            line.sharedMaterial = Effects.Unlit(Color.white);
            line.useWorldSpace = true; line.startWidth = line.endWidth = width;
            line.shadowCastingMode = ShadowCastingMode.Off; line.receiveShadows = false;
            line.positionCount = 0;
            return line;
        }

        public void ReleaseAim() { if (IsAiming) releaseQueued = true; }
        public void CancelAim()
        {
            IsAiming = releaseQueued = ValidTarget = false; AimLabel = "";
            if (held != null) held.SetActive(false);
            if (preview != null) preview.SetActive(false);
        }
        void OnApplicationFocus(bool focus) { if (!focus) CancelAim(); }
        void OnDisable() => CancelAim();
        void OnDestroy() { if (held != null) Destroy(held); }

        void LateUpdate()
        {
            if (!IsAiming) return;
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying || !player.CanFireFromCover || Cursor.lockState != CursorLockMode.Locked)
            { CancelAim(); return; }
            Bullet.SyncHitboxesForShot();
            origin = eye.transform.TransformPoint(.2f, -.08f, .42f);
            bool hit = Physics.Raycast(eye.transform.position, eye.transform.forward, out RaycastHit target,
                1500f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore);
            bool clear = GrenadeTrajectory.ClearRelease(eye.transform.position, origin);
            ValidTarget = hit && clear && GrenadeTrajectory.TryLaunch(origin, target.point, out velocity);
            if (ValidTarget)
            {
                Vector3 end = GrenadeTrajectory.Predict(origin, velocity, points);
                path.positionCount = points.Length; path.SetPositions(points);
                bool close = Vector3.Distance(end, eye.transform.position) < RocketProjectile.BlastRadius;
                Color color = close ? new Color(1f, .5f, .12f) : new Color(.4f, 1f, .6f);
                path.sharedMaterial = ring.sharedMaterial = Effects.Unlit(color);
                Vector3 normal = Physics.Raycast(end + Vector3.up * .1f, Vector3.down, out RaycastHit ground,
                    .4f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore) ? ground.normal : Vector3.up;
                Vector3 tangent = Vector3.Cross(normal, Vector3.forward).normalized;
                if (tangent.sqrMagnitude < .01f) tangent = Vector3.right;
                Vector3 bitangent = Vector3.Cross(normal, tangent);
                for (int i = 0; i < circle.Length; i++)
                {
                    float angle = i * Mathf.PI * 2f / (circle.Length - 1);
                    circle[i] = end + normal * .035f + (tangent * Mathf.Cos(angle) + bitangent * Mathf.Sin(angle)) * .8f;
                }
                ring.positionCount = circle.Length; ring.SetPositions(circle);
                AimLabel = string.Format("예상 폭발 지점 {0:0} m · {1}\nW 놓기: 투척 / 우클릭: 취소",
                    Vector3.Distance(eye.transform.position, end), close ? "가까운 폭발 주의" : "마우스로 위치 조절");
            }
            else
            {
                path.positionCount = ring.positionCount = 0;
                AimLabel = !clear ? "앞이 막혔습니다 · 사선을 높이거나 옆으로 이동하세요" : "50 m 안쪽 지면을 겨누세요 · 우클릭 취소";
            }
            if (!releaseQueued) return;
            bool throwNow = ValidTarget;
            string feedback = AimLabel;
            CancelAim();
            if (!throwNow) { gm.Hud.ShowShotFeedback(feedback); return; }
            Count--;
            readyAt = Time.time + 1f; weaponReadyAt = Time.time + .4f;
            gm.OnPlayerShot(eye.transform.position);
            gm.OnPlayerShotResolved(false, eye.transform.position);
            GrenadeProjectile.Throw(origin, velocity, eye.transform.position);
            gm.PlaySound(gm.Sounds.GrenadeToss, .75f);
        }
    }
}
