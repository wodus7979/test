using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class SniperHitValidation
    {
        [MenuItem("Sniper Ridge/저격 머리 명중 검사 (Play 중)")]
        public static void Validate()
        {
            if (!EditorApplication.isPlaying || GameManager.Instance == null || !GameManager.Instance.IsPlaying)
                throw new InvalidOperationException("Play에서 저격 임무를 시작한 뒤 검사를 실행하세요.");
            Physics.SyncTransforms();
            int checkedHeads = 0;
            foreach (var enemy in UnityEngine.Object.FindObjectsOfType<EnemySoldier>())
            {
                if (enemy.IsDead) continue;
                foreach (var hitbox in enemy.GetComponentsInChildren<EnemyHitbox>())
                {
                    if (!hitbox.IsHead || hitbox.name != "AnimatedHead") continue;
                    var collider = hitbox.GetComponent<Collider>();
                    if (collider == null || !collider.enabled)
                        throw new InvalidOperationException("살아 있는 적의 머리 판정이 꺼져 있습니다: " + enemy.name);
                    // The crown lies above the head joint. The old radius-.16 sphere
                    // missed this point; test the actual registered, animated collider.
                    Vector3 crown = enemy.Head.position + enemy.Head.up * (.23f * enemy.transform.lossyScale.y);
                    Vector3 from = crown + enemy.Head.forward * 2f;
                    var hits = Physics.RaycastAll(from, -enemy.Head.forward, 4f, ~0, QueryTriggerInteraction.Ignore);
                    if (!Array.Exists(hits, hit => hit.collider == collider))
                        throw new InvalidOperationException("머리 위쪽에 명중 판정이 없습니다: " + enemy.name);
                    checkedHeads++;
                }
            }
            if (checkedHeads == 0) throw new InvalidOperationException("검사할 애니메이션 병사가 없습니다.");
            Debug.Log("[Sniper Ridge] 저격 머리 명중 검사 통과: 살아 있는 병사 " + checkedHeads + "명의 머리 위쪽 레이 충돌 확인. 실제 사격·엄폐물·바람 검증은 별도입니다.");
        }
    }
}
