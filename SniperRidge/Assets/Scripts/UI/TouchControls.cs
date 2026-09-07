using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>누르고 있는 동안 상태를 전달하는 터치 버튼.</summary>
    public class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public System.Action OnDown;
        public System.Action OnUp;
        Image image;
        Color normal;

        void Awake()
        {
            image = GetComponent<Image>();
            normal = image.color;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            image.color = new Color(normal.r, normal.g, normal.b, Mathf.Min(1f, normal.a + 0.35f));
            OnDown?.Invoke();
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            image.color = normal;
            OnUp?.Invoke();
        }
    }

    /// <summary>모바일용 터치 조작: 화면 왼쪽 드래그로 조준, 오른쪽 버튼으로 사격/조준경/숨참기/재장전/배율/영점.</summary>
    public class TouchControls : MonoBehaviour
    {
        GameManager gm;
        int lookFinger = -1;
        float lookFraction = 0.55f;

        public static TouchControls Build(GameManager gm)
        {
            var go = new GameObject("TouchControls");
            var tc = go.AddComponent<TouchControls>();
            tc.gm = gm;
            tc.Construct(gm.Hud.RootCanvas.transform);
            return tc;
        }

        GameObject buttonsRoot;

        void Construct(Transform canvas)
        {
            var p = gm.Player;
            buttonsRoot = new GameObject("TouchButtons", typeof(RectTransform));
            buttonsRoot.transform.SetParent(canvas, false);
            UiKit.Place(buttonsRoot.GetComponent<RectTransform>(), Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            Transform root = buttonsRoot.transform;
            var bg = new Color(1f, 1f, 1f, 0.22f);
            var fg = Color.white;
            var br = new Vector2(1f, 0f);
            var bc = new Vector2(1f, 0f);

            MakeButton(root, "Fire", "사격", 34, bg, fg, br, bc, new Vector2(-170f, 170f), new Vector2(200f, 200f),
                       () => { p.PressFire(); p.SetFireHeld(true); }, () => p.SetFireHeld(false));
            MakeButton(root, "Scope", "조준경", 26, bg, fg, br, bc, new Vector2(-390f, 120f), new Vector2(160f, 100f), p.ToggleScope, null);
            MakeButton(root, "Breath", "숨 참기", 26, bg, fg, br, bc, new Vector2(-390f, 240f), new Vector2(160f, 100f), () => p.SetBreath(true), () => p.SetBreath(false));
            MakeButton(root, "Reload", "재장전", 26, bg, fg, br, bc, new Vector2(-170f, 390f), new Vector2(160f, 90f), p.PressReload, null);
            MakeButton(root, "Zoom", "배율", 26, bg, fg, br, bc, new Vector2(-390f, 360f), new Vector2(160f, 90f), p.CycleZoom, null);
            MakeButton(root, "ZeroUp", "영점 +", 24, bg, fg, br, bc, new Vector2(-570f, 240f), new Vector2(140f, 90f), () => p.AdjustZero(1), null);
            MakeButton(root, "ZeroDown", "영점 −", 24, bg, fg, br, bc, new Vector2(-570f, 120f), new Vector2(140f, 90f), () => p.AdjustZero(-1), null);
        }

        static void MakeButton(Transform parent, string name, string label, int fontSize, Color bg, Color fg,
                               Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size,
                               System.Action onDown, System.Action onUp)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            go.GetComponent<Image>().color = bg;   // TouchButton.Awake 가 기본 색을 읽기 전에 설정
            UiKit.Place(go.GetComponent<RectTransform>(), anchor, anchor, pivot, pos, size);
            var tb = go.AddComponent<TouchButton>();
            tb.OnDown = onDown;
            tb.OnUp = onUp;
            UiKit.Label(go.transform, "Label", label, fontSize, TextAnchor.MiddleCenter, fg,
                        new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, size, true);
        }

        void Update()
        {
            if (gm == null || gm.Player == null) return;
            bool show = gm.IsPlaying;
            if (buttonsRoot.activeSelf != show) buttonsRoot.SetActive(show);
            if (!show) return;
            var es = EventSystem.current;

            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch t = Input.GetTouch(i);
                switch (t.phase)
                {
                    case TouchPhase.Began:
                        if (lookFinger < 0 && t.position.x < Screen.width * lookFraction &&
                            (es == null || !es.IsPointerOverGameObject(t.fingerId)))
                            lookFinger = t.fingerId;
                        break;
                    case TouchPhase.Moved:
                        if (t.fingerId == lookFinger) gm.Player.AddLook(t.deltaPosition);
                        break;
                    case TouchPhase.Ended:
                    case TouchPhase.Canceled:
                        if (t.fingerId == lookFinger) lookFinger = -1;
                        break;
                }
            }
        }
    }
}
