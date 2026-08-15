"""황산벌 전투 역사 퀴즈 (초등학생용).

실행 방법:
    python3 hwangsanbeol_quiz.py
"""

import random

QUESTIONS = [
    {
        "question": "황산벌 전투는 어느 두 나라가 싸운 전투일까요?",
        "choices": ["백제와 신라", "고구려와 신라", "백제와 고구려", "신라와 발해"],
        "answer": "백제와 신라",
        "hint": "한 나라는 계백 장군, 다른 나라는 김유신 장군이 이끌었어요.",
        "explain": "황산벌 전투는 백제군과 신라군이 맞붙은 전투예요.",
    },
    {
        "question": "황산벌 전투에서 백제 군사를 이끈 장군은 누구일까요?",
        "choices": ["계백", "김유신", "을지문덕", "강감찬"],
        "answer": "계백",
        "hint": "이름이 두 글자이고, 5천 결사대를 이끌었어요.",
        "explain": "백제의 계백 장군이 결사대를 이끌고 싸웠어요.",
    },
    {
        "question": "황산벌 전투에서 신라 군사를 이끈 장군은 누구일까요?",
        "choices": ["김유신", "계백", "이순신", "연개소문"],
        "answer": "김유신",
        "hint": "훗날 삼국 통일에 큰 공을 세운 신라의 장군이에요.",
        "explain": "신라의 김유신 장군이 5만 명의 군사를 이끌었어요.",
    },
    {
        "question": "황산벌 전투가 일어난 해는 언제일까요?",
        "choices": ["660년", "612년", "1592년", "918년"],
        "answer": "660년",
        "hint": "백제가 멸망한 해와 같은 해예요.",
        "explain": "660년에 황산벌 전투가 벌어졌고, 그해에 백제가 멸망했어요.",
    },
    {
        "question": "계백 장군이 이끈 백제 결사대는 몇 명이었을까요?",
        "choices": ["5천 명", "5만 명", "100명", "50만 명"],
        "answer": "5천 명",
        "hint": "신라군 5만 명의 10분의 1이었어요.",
        "explain": "백제 결사대 5천 명이 신라군 5만 명과 맞섰어요.",
    },
    {
        "question": "황산벌은 오늘날 어느 지역일까요?",
        "choices": ["충청남도 논산", "강원도 강릉", "경상북도 경주", "제주도 서귀포"],
        "answer": "충청남도 논산",
        "hint": "백제의 도읍이었던 사비(부여) 근처예요.",
        "explain": "황산벌은 지금의 충청남도 논산 지역으로 알려져 있어요.",
    },
    {
        "question": "황산벌 전투에서 용감하게 싸우다 목숨을 잃은 신라의 어린 화랑은 누구일까요?",
        "choices": ["관창", "온달", "이사부", "장보고"],
        "answer": "관창",
        "hint": "신라 장군 품일의 아들이며, 홀로 적진에 뛰어들었어요.",
        "explain": "어린 화랑 관창의 용맹한 모습에 신라군의 사기가 크게 올랐어요.",
    },
    {
        "question": "신라가 백제를 공격할 때 힘을 합친 나라는 어디일까요?",
        "choices": ["당나라", "일본", "고구려", "몽골"],
        "answer": "당나라",
        "hint": "'나당 연합군'이라는 말에 힌트가 있어요.",
        "explain": "신라는 중국의 당나라와 손을 잡고 나당 연합군을 만들었어요.",
    },
    {
        "question": "백제 결사대는 처음 네 번의 싸움에서 어떻게 되었을까요?",
        "choices": ["네 번 모두 이겼다", "네 번 모두 졌다", "한 번도 싸우지 않았다", "모두 도망갔다"],
        "answer": "네 번 모두 이겼다",
        "hint": "수는 적었지만 아주 용감하게 싸웠어요.",
        "explain": "적은 수였지만 네 번의 싸움에서 모두 이겼고, 마지막 싸움에서 힘이 다해 졌어요.",
    },
    {
        "question": "황산벌 전투에서 최종적으로 이긴 나라는 어디일까요?",
        "choices": ["신라", "백제", "고구려", "무승부였다"],
        "answer": "신라",
        "hint": "군사 수가 훨씬 많았던 쪽이에요.",
        "explain": "결국 신라가 이겼고, 계백 장군은 끝까지 싸우다 전사했어요.",
    },
    {
        "question": "황산벌 전투가 끝난 뒤 곧바로 멸망한 나라는 어디일까요?",
        "choices": ["백제", "신라", "고구려", "가야"],
        "answer": "백제",
        "hint": "계백 장군의 나라예요.",
        "explain": "나당 연합군이 도읍 사비성을 함락하면서 백제는 660년에 멸망했어요.",
    },
    {
        "question": "'결사대'는 어떤 뜻일까요?",
        "choices": [
            "죽기를 각오하고 싸우는 부대",
            "말을 타고 달리는 부대",
            "성을 쌓는 사람들",
            "임금을 지키는 신하들",
        ],
        "answer": "죽기를 각오하고 싸우는 부대",
        "hint": "'결사'는 '죽음을 각오한다'는 뜻이에요.",
        "explain": "결사대는 죽기를 각오하고 싸우는 군사들을 말해요.",
    },
]


def ask(number, total, quiz):
    """문제 하나를 내고 맞혔는지 여부를 돌려줍니다."""
    choices = quiz["choices"][:]
    random.shuffle(choices)

    print(f"\n[{number}/{total}번 문제] {quiz['question']}")
    for index, choice in enumerate(choices, start=1):
        print(f"  {index}. {choice}")

    while True:
        answer = input("정답 번호를 입력하세요 (힌트는 h): ").strip()

        if answer.lower() == "h":
            print(f"💡 힌트: {quiz['hint']}")
            continue

        if not answer.isdigit() or not 1 <= int(answer) <= len(choices):
            print(f"1부터 {len(choices)}까지의 번호를 입력해 주세요.")
            continue

        picked = choices[int(answer) - 1]
        break

    if picked == quiz["answer"]:
        print("⭕ 정답이에요! 잘했어요!")
        correct = True
    else:
        print(f"❌ 아쉬워요. 정답 → '{quiz['answer']}'")
        correct = False

    print(f"📖 {quiz['explain']}")
    return correct


def show_result(score, total, wrong_notes):
    """점수와 오답 노트를 보여 줍니다."""
    print("\n" + "=" * 46)
    print(f"🎉 퀴즈 끝! 모두 {total}문제 중 {score}문제를 맞혔어요.")

    percent = score / total * 100
    if percent == 100:
        print("🏆 완벽해요! 황산벌 전투 박사님이네요!")
    elif percent >= 70:
        print("👍 아주 잘했어요! 조금만 더 하면 만점이에요.")
    elif percent >= 40:
        print("🙂 좋아요! 틀린 문제를 다시 읽어 보면 더 잘할 수 있어요.")
    else:
        print("💪 괜찮아요! 설명을 읽고 한 번 더 도전해 봐요.")

    if wrong_notes:
        print("\n📝 오답 노트")
        for question, answer in wrong_notes:
            print(f"  - {question}")
            print(f"    → 정답: {answer}")
    print("=" * 46)


def main():
    print("=" * 46)
    print("      ⚔️  황산벌 전투 역사 퀴즈  ⚔️")
    print("=" * 46)
    print("660년, 백제와 신라가 황산벌에서 맞붙었어요.")
    print("모두 몇 문제를 맞힐 수 있을까요?")
    print("(정답 번호를 입력하고, 힌트가 필요하면 h를 눌러요.)")

    quizzes = QUESTIONS[:]
    random.shuffle(quizzes)

    score = 0
    wrong_notes = []
    for number, quiz in enumerate(quizzes, start=1):
        if ask(number, len(quizzes), quiz):
            score += 1
        else:
            wrong_notes.append((quiz["question"], quiz["answer"]))

    show_result(score, len(quizzes), wrong_notes)


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\n\n퀴즈를 마칩니다. 다음에 또 만나요! 👋")
