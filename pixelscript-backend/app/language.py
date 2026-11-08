"""PixelScript language definition and sample programs, served at /api/language and /api/examples."""

KEYWORDS = [
    {"keyword": "press_start", "purpose": "Program start (optional)", "token": "START"},
    {"keyword": "spawn_int", "purpose": "Integer declaration", "token": "INT"},
    {"keyword": "spawn_bool", "purpose": "Boolean declaration", "token": "BOOL"},
    {"keyword": "spawn_text", "purpose": "String declaration", "token": "STRING"},
    {"keyword": "render", "purpose": "Print / output", "token": "PRINT"},
    {"keyword": "check_point", "purpose": "If condition", "token": "IF"},
    {"keyword": "respawn", "purpose": "Else condition", "token": "ELSE"},
    {"keyword": "grind", "purpose": "Loop (while)", "token": "WHILE"},
    {"keyword": "win", "purpose": "Boolean true", "token": "TRUE"},
    {"keyword": "lose", "purpose": "Boolean false", "token": "FALSE"},
]

OPERATORS = [
    {"symbol": "[=]", "purpose": "Assignment"},
    {"symbol": "[+]", "purpose": "Addition"},
    {"symbol": "[-]", "purpose": "Subtraction"},
    {"symbol": "[*]", "purpose": "Multiplication"},
    {"symbol": "[/]", "purpose": "Division"},
    {"symbol": "[>]", "purpose": "Greater than"},
    {"symbol": "[<]", "purpose": "Less than"},
    {"symbol": "[==]", "purpose": "Equal comparison"},
    {"symbol": "[>=]", "purpose": "Greater or equal"},
    {"symbol": "[<=]", "purpose": "Less or equal"},
    {"symbol": "[!=]", "purpose": "Not equal"},
]

GRAMMAR = """program    -> press_start? stmt_list EOF
stmt_list  -> stmt stmt_list | epsilon
stmt       -> decl | assign | if_stmt | while_stmt | print_stmt
decl       -> type ID ';' | type ID '[=]' expr ';'
type       -> spawn_int | spawn_bool | spawn_text
assign     -> ID '[=]' expr ';'
if_stmt    -> check_point '(' expr ')' block
            | check_point '(' expr ')' block respawn block
while_stmt -> grind '(' expr ')' block
print_stmt -> render '(' expr ')' ';'
block      -> '{' stmt_list '}'
expr       -> arith | arith relop arith
relop      -> '[<]' | '[>]' | '[<=]' | '[>=]' | '[==]' | '[!=]'
arith      -> term { ('[+]' | '[-]') term }
term       -> factor { ('[*]' | '[/]') factor }
factor     -> NUM | STR | win | lose | ID | '(' expr ')'"""

LANGUAGE = {
    "name": "PixelScript",
    "theme": "Gaming",
    "description": "A small gaming-themed language with integers, booleans and strings, "
                   "if/else, while loops and print. Operators are written inside square brackets. "
                   "Comments start with //.",
    "data_types": [
        {"keyword": "spawn_int", "type": "integer", "example": "spawn_int score [=] 5;"},
        {"keyword": "spawn_bool", "type": "boolean", "example": "spawn_bool alive [=] win;"},
        {"keyword": "spawn_text", "type": "string", "example": 'spawn_text name [=] "Babar";'},
    ],
    "keywords": KEYWORDS,
    "operators": OPERATORS,
    "grammar": GRAMMAR,
}

EXAMPLES = [
    {
        "id": "lab-sample",
        "title": "Lab sample (valid)",
        "description": "The valid program from the solved labs.",
        "source": """press_start
spawn_int score [=] 5;
spawn_int target [=] 10;
spawn_int total;
spawn_bool winner [=] lose;
spawn_text msg [=] "level complete";
total [=] score [+] target [*] 2;
check_point (total [>] 20) {
    winner [=] win;
} respawn {
    winner [=] lose;
}
grind (score [<] target) {
    score [=] score [+] 1;
}
render(total);
render(msg);
""",
    },
    {
        "id": "cricket-chase",
        "title": "PSL run chase (valid)",
        "description": "A Karachi Kings run chase using if/else and a loop.",
        "source": """press_start
// Karachi Kings chasing a PSL target
spawn_text team [=] "Karachi Kings";
spawn_int runs [=] 120;
spawn_int target [=] 150;
spawn_int balls_left [=] 30;
spawn_bool chase_on [=] win;
grind (balls_left [>] 0) {
    runs [=] runs [+] 2;
    balls_left [=] balls_left [-] 1;
}
check_point (runs [>=] target) {
    render(team);
    chase_on [=] lose;
} respawn {
    render(runs);
}
""",
    },
    {
        "id": "lexical-error",
        "title": "Lexical error",
        "description": "Unknown character and a malformed operator.",
        "source": """press_start
spawn_int score [=] 5;
score [=] score [+ 1;
spawn_int lives [=] 3 @;
""",
    },
    {
        "id": "syntax-error",
        "title": "Syntax error (missing semicolon)",
        "description": "Missing ';' after the second declaration.",
        "source": """press_start
spawn_int score [=] 5;
spawn_int target [=] 10
total [=] score [+] target;
""",
    },
    {
        "id": "semantic-errors",
        "title": "Semantic errors (all six rules)",
        "description": "Duplicate declaration, undeclared variable, type mismatches, non-boolean condition.",
        "source": """press_start
spawn_int score [=] 5;
spawn_int score [=] 7;
spawn_text player [=] "Babar";
spawn_bool ready [=] 3;
missing [=] score [+] 1;
score [=] score [+] player;
check_point (score) {
    render(score);
}
check_point (score [==] player) {
    render(player);
}
""",
    },
]
