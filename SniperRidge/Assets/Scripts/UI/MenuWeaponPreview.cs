using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>A small equipment studio, outside the battlefield and owned by the start menu.</summary>
    public sealed class MenuWeaponPreview : MonoBehaviour
    {
        const int PreviewLayer = 31;
        GameObject studio, model;
        Camera previewCamera;
        RenderTexture target;
        RawImage display;

        public void Initialize(RawImage image, Color background)
        {
            display = image;
            studio = new GameObject("Menu equipment studio");
            studio.transform.position = new Vector3(20000f, -20000f, 20000f);
            var cameraObject = new GameObject("Equipment camera", typeof(Camera));
            cameraObject.transform.SetParent(studio.transform, false);
            cameraObject.transform.localPosition = new Vector3(0f, 0f, -4f);
            previewCamera = cameraObject.GetComponent<Camera>();
            previewCamera.orthographic = true;
            previewCamera.nearClipPlane = .05f;
            previewCamera.farClipPlane = 12f;
            previewCamera.cullingMask = 1 << PreviewLayer;
            previewCamera.clearFlags = CameraClearFlags.SolidColor;
            previewCamera.backgroundColor = background;
            previewCamera.allowHDR = false;
            previewCamera.useOcclusionCulling = false;
            // Render only on selection. The studio does no extra camera work during gameplay.
            previewCamera.enabled = false;
            target = new RenderTexture(1504, 516, 16, RenderTextureFormat.ARGB32);
            target.name = "Start menu weapon preview";
            target.antiAliasing = 4;
            target.Create();
            previewCamera.targetTexture = target;
            previewCamera.aspect = 752f / 258f;
            display.texture = target;
            AddLight("Warm key", new Vector3(-1.5f, 2f, -2f), new Color(1f, .9f, .72f), 3f);
            AddLight("Cool fill", new Vector3(1.5f, .6f, -1.3f), new Color(.65f, .8f, 1f), 2f);
        }

        void AddLight(string title, Vector3 position, Color color, float intensity)
        {
            var go = new GameObject(title, typeof(Light));
            go.transform.SetParent(studio.transform, false);
            go.transform.localPosition = position;
            var light = go.GetComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;
            light.range = 8f;
            light.cullingMask = 1 << PreviewLayer;
            light.shadows = LightShadows.None;
        }

        public void Show(WeaponDefinition weapon)
        {
            if (studio == null) return;
            if (model != null) { model.SetActive(false); Destroy(model); }
            model = WeaponModels.Build(studio.transform, weapon);
            if (model == null) return;
            model.transform.localPosition = Vector3.zero;
            model.transform.localRotation = Quaternion.Euler(-8f, 65f, -6f);
            foreach (var t in model.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = PreviewLayer;
            foreach (var r in model.GetComponentsInChildren<Renderer>())
            {
                r.shadowCastingMode = ShadowCastingMode.Off;
                r.receiveShadows = false;
            }
            var renderers = model.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return;
            Bounds bounds = renderers[0].bounds;
            foreach (var r in renderers) bounds.Encapsulate(r.bounds);
            model.transform.position += studio.transform.position - bounds.center;
            previewCamera.orthographicSize = Mathf.Max(bounds.extents.y, bounds.extents.x / previewCamera.aspect) * 1.28f + .025f;
            previewCamera.Render();
        }

        void OnDisable() => Release();
        void OnDestroy() => Release();

        void Release()
        {
            if (display != null) display.texture = null;
            if (previewCamera != null) previewCamera.targetTexture = null;
            if (target != null) { target.Release(); Destroy(target); target = null; }
            if (studio != null) { studio.SetActive(false); Destroy(studio); studio = null; }
        }
    }
}
