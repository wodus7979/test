using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class TrenchValidation
    {
        [MenuItem("Sniper Ridge/참호 구조와 엄폐 검사 (Play 중)")]
        public static void Validate()
        {
            var game = GameManager.Instance;
            var trench = UnityEngine.Object.FindObjectOfType<TrenchBuilder>();
            if (!EditorApplication.isPlaying || game == null || trench == null)
                throw new InvalidOperationException("Play를 시작하고 참호가 생성된 뒤 검사를 실행하세요.");
            Vector3 floor = trench.transform.position;
            float centre = TerrainGenerator.GroundHeight(game.Terrain, floor.x, floor.z);
            Check(centre < floor.y - .06f, "지형이 사격 발판 아래로 굴착되지 않았습니다.");
            float rear = TerrainGenerator.GroundHeight(game.Terrain, floor.x, floor.z - 3.5f);
            Check(rear < floor.y - .50f, "후방 통로의 깊이가 부족합니다.");
            Physics.SyncTransforms();
            foreach (float x in new[] { -1.15f, 0f, 1.15f })
            {
                Vector3 exposed = floor + new Vector3(x, 1.47f, 0f);
                Vector3 hidden = floor + new Vector3(x, .68f, 0f);
                Check(!EnemyProjectile.WorldHit(exposed + Vector3.forward * 8f, exposed, null, out _), "서 있는 사선이 막혔습니다: " + x);
                Check(EnemyProjectile.WorldHit(hidden + Vector3.forward * 8f, hidden, null, out _), "숙인 플레이어에게 엄폐물이 없습니다: " + x);
                Check(Physics.Raycast(floor + new Vector3(x, .15f, 0f), Vector3.down, out RaycastHit deck, .4f), "사격 발판 콜라이더가 없습니다.");
                Check(Mathf.Abs(deck.point.y - floor.y) < .06f, "발판과 플레이어 발 높이가 다릅니다.");
            }
            var meshes = new HashSet<Mesh>();
            foreach (var filter in trench.GetComponentsInChildren<MeshFilter>()) meshes.Add(filter.sharedMesh);
            int triangles = 0;
            foreach (var mesh in meshes)
            {
                var vertices = mesh.vertices; var indices = mesh.triangles; var normals = mesh.normals;
                Check(indices.Length % 3 == 0 && normals.Length == vertices.Length, "메시 데이터가 불완전합니다.");
                for (int i = 0; i < indices.Length; i += 3)
                {
                    int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                    Check(a >= 0 && b >= 0 && c >= 0 && a < vertices.Length && b < vertices.Length && c < vertices.Length, "잘못된 삼각형 인덱스입니다.");
                    Vector3 face = Vector3.Cross(vertices[b] - vertices[a], vertices[c] - vertices[a]);
                    Check(face.sqrMagnitude > .0000000001f && Vector3.Dot(face, normals[a] + normals[b] + normals[c]) > 0f,
                        "뒤집히거나 퇴화한 삼각형: " + mesh.name);
                    triangles++;
                }
            }
            Debug.Log("[Sniper Ridge] 참호 검사 통과: 굴착 깊이, 3개 사격 위치의 엄폐/노출/발판, 공유 메시 " + meshes.Count + "종의 삼각형 " + triangles + "개. 실제 화면과 경사진 사선도 확인하세요.");
        }

        static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("[참호 검사] " + message);
        }
    }
}
