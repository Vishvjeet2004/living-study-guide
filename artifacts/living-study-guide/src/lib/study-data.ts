export type Note = { id: string; title: string; topic: string; readTime: string; body: string };
export type Draft = {
  id: string;
  kind: 'flashcard' | 'quiz';
  topic: string;
  prompt: string;
  answer: string;
  choices: string[];
  correctIndex: number;
  excerpt: string;
  sourceNoteId: string;
};
export type Flashcard = { id: string; topic: string; prompt: string; answer: string; sourceNoteId: string; excerpt: string };
export type StudySettings = { dailyGoal: number; reducedMotion: boolean };

export const notes: Note[] = [
  {
    id: 'csharp-foundations', title: 'C# building blocks', topic: 'C# fundamentals', readTime: '6 min',
    body: `A class is a blueprint that defines the data and behavior a particular kind of object can have. A class can contain fields, properties, constructors, and methods. An object is a concrete instance created from that blueprint, with its own values for the class's data.\n\nInheritance lets a class reuse and extend another class. The derived class inherits accessible members from its base class and can add new behavior or override virtual methods. C# supports single class inheritance: a class has one direct base class.\n\nAn interface defines a contract: a set of members a type agrees to provide. A class can implement multiple interfaces, which makes interfaces useful when different types need to offer the same capability without sharing a base class.`
  },
  {
    id: 'mvc-architecture', title: 'ASP.NET Core MVC, at a glance', topic: 'ASP.NET Core MVC', readTime: '5 min',
    body: `ASP.NET Core MVC separates an application into three cooperating parts: Models, Views, and Controllers. A request is routed to a controller action. The action works with model data, then chooses a response, often by returning a view.\n\nThis separation gives each part a focused role. Models represent application data and rules. Views render the user interface. Controllers handle incoming requests, coordinate work, and select a result. A controller should coordinate rather than become a home for every business rule.\n\nThe framework uses conventions, but attributes and configuration can make behavior explicit. Keeping responsibilities clear makes an application easier to test and change.`
  },
  {
    id: 'mvc-parts', title: 'Models, Views, and Controllers', topic: 'MVC components', readTime: '4 min',
    body: `A model represents the data and domain rules an application works with. It may be a simple view model designed for one screen, or a domain type that carries business behavior. A model is not automatically a database table.\n\nA view is a Razor file that combines HTML with server-side expressions to present data. Views should focus on display and avoid owning request-handling logic.\n\nA controller receives a request through an action method, validates input, coordinates services, and returns an action result. Common results include a rendered view, a redirect, or a status response. Passing a purpose-built view model to a view helps keep the page contract clear.`
  },
  {
    id: 'routing-di', title: 'Routing and dependency injection', topic: 'Request pipeline', readTime: '5 min',
    body: `Routing matches an incoming URL and HTTP method to an endpoint. In MVC, a conventional route commonly includes controller, action, and an optional identifier. Attribute routes place route templates directly on controllers or actions and make endpoint URLs explicit.\n\nDependency injection supplies a class with the services it needs instead of having the class construct those dependencies itself. ASP.NET Core has a built-in service container. Services are registered during application startup and requested through constructors.\n\nThe common lifetimes are transient, scoped, and singleton. A scoped service is created once per request, while a singleton is shared for the application's lifetime. A service should not capture a dependency with a shorter lifetime than its own.`
  },
  {
    id: 'efcore-crud', title: 'EF Core and everyday CRUD', topic: 'Data access', readTime: '7 min',
    body: `Entity Framework Core (EF Core) is an object-relational mapper for .NET. It lets application code work with .NET objects while a database provider translates queries and changes into database operations. A DbContext represents a session with the database and tracks changes to entities.\n\nCRUD describes the basic data operations: create, read, update, and delete. In EF Core, adding an entity and calling SaveChangesAsync persists a create. LINQ queries read data. Changing a tracked entity and saving persists an update. Removing an entity and saving persists a delete.\n\nDatabase work is commonly performed asynchronously in web applications. A context is typically registered with a scoped lifetime so that each request uses its own unit of work. Validate input and handle missing records before saving changes.`
  },
];

export const initialDrafts: Draft[] = [
  { id: 'seed-card-1', kind: 'flashcard', topic: 'C# fundamentals', prompt: 'What is a class in C#?', answer: 'A blueprint that defines the data and behavior a kind of object can have.', choices: [], correctIndex: 0, excerpt: 'A class is a blueprint that defines the data and behavior a particular kind of object can have.', sourceNoteId: 'csharp-foundations' },
  { id: 'seed-quiz-1', kind: 'quiz', topic: 'ASP.NET Core MVC', prompt: 'Which MVC part handles incoming requests and selects a result?', answer: 'Controller', choices: ['Model', 'View', 'Controller', 'DbContext'], correctIndex: 2, excerpt: 'Controllers handle incoming requests, coordinate work, and select a result.', sourceNoteId: 'mvc-architecture' },
  { id: 'seed-card-2', kind: 'flashcard', topic: 'Request pipeline', prompt: 'What does dependency injection do?', answer: 'It supplies a class with needed services instead of making the class construct them itself.', choices: [], correctIndex: 0, excerpt: 'Dependency injection supplies a class with the services it needs instead of having the class construct those dependencies itself.', sourceNoteId: 'routing-di' },
  { id: 'seed-quiz-2', kind: 'quiz', topic: 'Data access', prompt: 'Which EF Core object tracks changes to entities during a database session?', answer: 'DbContext', choices: ['DbContext', 'Razor view', 'Controller action', 'Route template'], correctIndex: 0, excerpt: 'A DbContext represents a session with the database and tracks changes to entities.', sourceNoteId: 'efcore-crud' },
];

export const generatedDrafts: Draft[] = [
  ...initialDrafts,
  { id: 'gen-card-object', kind: 'flashcard', topic: 'C# fundamentals', prompt: 'What is an object?', answer: 'A concrete instance created from a class blueprint, with its own values for the class data.', choices: [], correctIndex: 0, excerpt: 'An object is a concrete instance created from that blueprint, with its own values for the class\'s data.', sourceNoteId: 'csharp-foundations' },
  { id: 'gen-quiz-interface', kind: 'quiz', topic: 'C# fundamentals', prompt: 'What does an interface define?', answer: 'A contract of members that a type agrees to provide.', choices: ['A database session', 'A contract of members', 'A concrete object instance', 'A URL pattern'], correctIndex: 1, excerpt: 'An interface defines a contract: a set of members a type agrees to provide.', sourceNoteId: 'csharp-foundations' },
  { id: 'gen-card-mvc', kind: 'flashcard', topic: 'MVC components', prompt: 'What is the focused role of a controller?', answer: 'Receive a request, validate input, coordinate services, and return an action result.', choices: [], correctIndex: 0, excerpt: 'A controller receives a request through an action method, validates input, coordinates services, and returns an action result.', sourceNoteId: 'mvc-parts' },
  { id: 'gen-quiz-routing', kind: 'quiz', topic: 'Request pipeline', prompt: 'What does routing match to an endpoint?', answer: 'An incoming URL and HTTP method.', choices: ['A model and its view', 'An incoming URL and HTTP method', 'A scoped service and a singleton', 'An entity and its DbContext'], correctIndex: 1, excerpt: 'Routing matches an incoming URL and HTTP method to an endpoint.', sourceNoteId: 'routing-di' },
  { id: 'gen-card-ef', kind: 'flashcard', topic: 'Data access', prompt: 'What does CRUD stand for?', answer: 'Create, read, update, and delete.', choices: [], correctIndex: 0, excerpt: 'CRUD describes the basic data operations: create, read, update, and delete.', sourceNoteId: 'efcore-crud' },
  { id: 'gen-quiz-lifetimes', kind: 'quiz', topic: 'Request pipeline', prompt: 'Which service lifetime creates one instance per request?', answer: 'Scoped', choices: ['Transient', 'Scoped', 'Singleton', 'Static'], correctIndex: 1, excerpt: 'A scoped service is created once per request, while a singleton is shared for the application\'s lifetime.', sourceNoteId: 'routing-di' },
];

export const STORAGE_KEY = 'living-study-guide-v1';
