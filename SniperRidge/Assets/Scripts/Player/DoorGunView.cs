using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Asset-authored yaw/pitch mount, grips and a stable lower-centre first-person view.</summary>
    public sealed class DoorGunView : MonoBehaviour
    {
        public const string Resource = WeaponModels.ResourceRoot+"mounted_machine_gun";
        public const int ViewLayer = 30;
        public static readonly Vector3 EyeToPivot = new Vector3(0f, -.34f, 1.28f);
        public static bool IsReady => Resources.Load<GameObject>(Resource) != null;
        public Transform Muzzle { get; private set; }
        Transform yawMount, weapon;
        Camera eye, viewCamera;
        int originalMask;
        public static GameObject Create(Transform parent)
        {
            var prefab = Resources.Load<GameObject>(Resource);
            if (prefab == null) { Debug.LogError("[Sniper Ridge] 헬기 중기관총 에셋 생성 메뉴를 실행하세요."); return null; }
            var root = Instantiate(prefab, parent, false);
            root.name = "Mounted Heavy Machine Gun";
            foreach (var collider in root.GetComponentsInChildren<Collider>())
            { collider.enabled = false; Destroy(collider); }
            var lod = root.GetComponent<LODGroup>();
            if (lod != null) lod.ForceLOD(0);
            var gun = root.AddComponent<DoorGunView>();
            gun.yawMount = root.transform.Find("Base/YawMount");
            gun.weapon = gun.yawMount.Find("Weapon");
            gun.Muzzle = gun.weapon.Find("Muzzle");
            GunnerHands.Build(gun.weapon.Find("RearGripLeft"), -1f);
            GunnerHands.Build(gun.weapon.Find("RearGripRight"), 1f);
            var flash = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            flash.name = "Blast"; flash.transform.SetParent(gun.Muzzle, false);
            flash.transform.localPosition = new Vector3(0, 0, .16f);
            flash.transform.localScale = new Vector3(.12f, .12f, .4f);
            flash.GetComponent<Collider>().enabled = false; Destroy(flash.GetComponent<Collider>());
            flash.GetComponent<Renderer>().sharedMaterial = Effects.Unlit(new Color(1f, .72f, .18f));
            flash.SetActive(false);
            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            { r.shadowCastingMode = ShadowCastingMode.Off; r.receiveShadows = false; }
            return root;
        }
        public void Attach(Camera camera)
        {
            eye = camera;
            originalMask = eye.cullingMask;
            eye.cullingMask &= ~(1 << ViewLayer);
            foreach (var part in GetComponentsInChildren<Transform>(true)) part.gameObject.layer = ViewLayer;
            viewCamera = new GameObject("Door gun and hands camera").AddComponent<Camera>();
            viewCamera.transform.SetParent(eye.transform, false);
            viewCamera.clearFlags = CameraClearFlags.Depth;
            viewCamera.cullingMask = 1 << ViewLayer;
            viewCamera.depth = eye.depth + 1f;
            viewCamera.nearClipPlane = .025f; viewCamera.farClipPlane = 8f;
            viewCamera.fieldOfView = 60f;
            viewCamera.allowHDR = false; viewCamera.allowMSAA = true;
            viewCamera.useOcclusionCulling = false;
        }
        public void Pose(float yaw, float pitch)
        {
            transform.localPosition = new Vector3(0f, .08f, .73f);
            transform.localRotation = Quaternion.identity;
            yawMount.localRotation = Quaternion.Euler(0f, yaw, 0f);
            weapon.localRotation = Quaternion.Euler(pitch, 0f, 0f);
            // Camera follows the gun's shoulder arc, while the base stays attached to the airframe.
            eye.transform.SetPositionAndRotation(weapon.position - weapon.rotation * EyeToPivot, weapon.rotation);
        }
        void OnDestroy()
        {
            if (eye != null) eye.cullingMask = originalMask;
            if (viewCamera != null) Destroy(viewCamera.gameObject);
        }
    }
}
